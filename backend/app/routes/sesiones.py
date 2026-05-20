from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session

from app.utils.database import get_db
from app.utils.dependencies import get_current_user
from app.models.usuario import Usuario
from app.schemas.sesion import SesionCreate, SesionUpdate, SesionResponse, ArchivoResponse
from app.services import sesion_service
from app.services import cruce_service
from app.services.chat_engine import invalidar_cache_sesion

router = APIRouter(prefix="/sesiones", tags=["sesiones"])


@router.post("", response_model=SesionResponse, status_code=201)
def crear_sesion(
    data: SesionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Crea una nueva sesión de trabajo para el usuario autenticado."""
    return sesion_service.crear_sesion(db, current_user.id, data.nombre_sesion)


@router.get("", response_model=list[SesionResponse])
def listar_sesiones(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Lista todas las sesiones del usuario autenticado."""
    return sesion_service.listar_sesiones(db, current_user.id)


@router.post("/{sesion_id}/archivos", response_model=ArchivoResponse, status_code=201)
async def subir_archivo(
    sesion_id: int,
    fuente_tipo: str = Form(...),          # "erp" | "dnit" | "marketing"
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Recibe un Excel, lo guarda en disco, detecta columnas con IA y registra en BD.
    Requiere form-data con campos: fuente_tipo (string) + file (archivo).
    """
    resultado = await sesion_service.procesar_archivo(
        db, sesion_id, current_user.id, fuente_tipo, file
    )
    invalidar_cache_sesion(sesion_id)
    return resultado


@router.get("/{sesion_id}/archivos", response_model=list[ArchivoResponse])
def listar_archivos(
    sesion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Lista los archivos subidos en una sesión."""
    return sesion_service.listar_archivos(db, sesion_id, current_user.id)


@router.post("/{sesion_id}/cruzar")
def cruzar_datos(
    sesion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Ejecuta el motor de entity resolution sobre los archivos de la sesión.
    Lee los Excel en disco, cruza los nombres de empresa en 3 capas
    (exacto → fuzzy → semántico) y guarda resultados en matches_cruzados.
    Devuelve un resumen con conteos por estado.
    """
    return cruce_service.ejecutar_cruce(db, sesion_id, current_user.id)


@router.patch("/{sesion_id}", response_model=SesionResponse)
def actualizar_sesion(
    sesion_id: int,
    data: SesionUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Actualiza el nombre de una sesión.
    """
    from app.models.sesion import Sesion
    sesion = db.query(Sesion).filter(
        Sesion.id == sesion_id,
        Sesion.usuario_id == current_user.id,
    ).first()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    if data.nombre_sesion is not None:
        sesion.nombre_sesion = data.nombre_sesion

    db.commit()
    db.refresh(sesion)
    return sesion


@router.delete("/{sesion_id}", status_code=204)
def eliminar_sesion(
    sesion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Elimina una sesión y todos sus datos asociados (archivos, matches, conversaciones).
    """
    from app.models.sesion import Sesion
    from app.models.archivo import Archivo
    from app.models.match import MatchCruzado
    from app.models.conversacion import Conversacion
    from app.models.mensaje import Mensaje

    sesion = db.query(Sesion).filter(
        Sesion.id == sesion_id,
        Sesion.usuario_id == current_user.id,
    ).first()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    # Eliminar en cascade: mensajes -> conversaciones -> matches -> archivos -> sesion
    conversaciones = db.query(Conversacion).filter(Conversacion.sesion_id == sesion_id).all()
    for conv in conversaciones:
        db.query(Mensaje).filter(Mensaje.conversacion_id == conv.id).delete()
        db.delete(conv)

    db.query(MatchCruzado).filter(MatchCruzado.sesion_id == sesion_id).delete()
    db.query(Archivo).filter(Archivo.sesion_id == sesion_id).delete()
    db.delete(sesion)
    db.commit()
