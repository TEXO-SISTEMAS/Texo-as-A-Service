from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.utils.database import get_db
from app.utils.dependencies import get_current_user
from app.models.usuario import Usuario
from app.models.conversacion import Conversacion
from app.models.mensaje import Mensaje
from app.models.sesion import Sesion
from app.schemas.conversacion import (
    ConversacionCreate, ConversacionUpdate, ConversacionResponse,
    MensajeRequest, MensajeResponse, ChatResponse,
)
from app.services import chat_engine

router = APIRouter(prefix="/conversaciones", tags=["chat"])


# Rutas específicas primero para evitar conflictos con rutas dinámicas
@router.post("/{conv_id}/mensajes", response_model=ChatResponse)
def enviar_mensaje(
    conv_id: int,
    data: MensajeRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Envía un mensaje del usuario y devuelve la respuesta de la IA.
    """
    # Obtener la conversación para auto-generar nombre si es el primer mensaje
    conversacion = db.query(Conversacion).filter(
        Conversacion.id == conv_id,
        Conversacion.usuario_id == current_user.id,
    ).first()
    if not conversacion:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")

    # Auto-generar nombre si es el primer mensaje y no tiene nombre
    primer_mensaje = (
        db.query(Mensaje)
        .filter(Mensaje.conversacion_id == conv_id, Mensaje.rol == "user")
        .first()
    )
    if not conversacion.nombre and not primer_mensaje:
        conversacion.nombre = data.contenido[:40] + ("..." if len(data.contenido) > 40 else "")
        db.commit()

    resultado = chat_engine.procesar_mensaje(
        db=db,
        conversacion_id=conv_id,
        usuario_id=current_user.id,
        pregunta=data.contenido,
    )

    # Obtener el ID del último mensaje del asistente guardado
    ultimo_msg = (
        db.query(Mensaje)
        .filter(
            Mensaje.conversacion_id == conv_id,
            Mensaje.rol == "assistant",
        )
        .order_by(Mensaje.created_at.desc())
        .first()
    )

    return ChatResponse(
        respuesta=resultado["respuesta"],
        grafico_json=resultado["grafico_json"],
        mensaje_id=ultimo_msg.id if ultimo_msg else 0,
    )


@router.get("/{conv_id}/mensajes", response_model=list[MensajeResponse])
def historial_mensajes(
    conv_id: int,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Devuelve el historial de mensajes de una conversación.
    """
    conv = (
        db.query(Conversacion)
        .filter(
            Conversacion.id == conv_id,
            Conversacion.usuario_id == current_user.id,
        )
        .first()
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")

    return (
        db.query(Mensaje)
        .filter(Mensaje.conversacion_id == conv_id)
        .order_by(Mensaje.created_at)
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/sesion/{sesion_id}", response_model=list[ConversacionResponse])
def listar_conversaciones_sesion(
    sesion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Lista todas las conversaciones de una sesión."""
    sesion = db.query(Sesion).filter(
        Sesion.id == sesion_id,
        Sesion.usuario_id == current_user.id,
    ).first()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    return (
        db.query(Conversacion)
        .filter(Conversacion.sesion_id == sesion_id)
        .order_by(Conversacion.created_at.desc())
        .all()
    )


@router.get("/{conv_id}", response_model=ConversacionResponse)
def obtener_conversacion(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Obtiene una conversación por su ID."""
    conv = db.query(Conversacion).filter(
        Conversacion.id == conv_id,
        Conversacion.usuario_id == current_user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    return conv


@router.post("", response_model=ConversacionResponse, status_code=201)
def crear_conversacion(
    data: ConversacionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Crea una nueva conversación dentro de una sesión.
    Una sesión puede tener múltiples conversaciones (el usuario puede empezar de nuevo).
    """
    # Verificar que la sesión pertenece al usuario
    sesion = db.query(Sesion).filter(
        Sesion.id == data.sesion_id,
        Sesion.usuario_id == current_user.id,
    ).first()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    conv = Conversacion(
        sesion_id=data.sesion_id,
        usuario_id=current_user.id,
        nombre=data.nombre,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.patch("/{conv_id}", response_model=ConversacionResponse)
def actualizar_conversacion(
    conv_id: int,
    data: ConversacionUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Actualiza el nombre de una conversación.
    """
    conv = db.query(Conversacion).filter(
        Conversacion.id == conv_id,
        Conversacion.usuario_id == current_user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")

    if data.nombre is not None:
        conv.nombre = data.nombre

    db.commit()
    db.refresh(conv)
    return conv


@router.delete("/{conv_id}", status_code=204)
def eliminar_conversacion(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Elimina una conversación y todos sus mensajes.
    """
    conv = db.query(Conversacion).filter(
        Conversacion.id == conv_id,
        Conversacion.usuario_id == current_user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")

    # Eliminar mensajes asociados (cascade)
    db.query(Mensaje).filter(Mensaje.conversacion_id == conv_id).delete()
    db.delete(conv)
    db.commit()
