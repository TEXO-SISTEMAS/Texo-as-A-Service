from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime

from app.utils.database import get_db
from app.utils.dependencies import get_current_user
from app.models.usuario import Usuario
from app.models.match_cruzado import MatchCruzado
from app.models.match_global import MatchGlobal
from app.models.sesion import Sesion
from app.schemas.match import MatchResponse, MatchUpdate, MatchResponse

router = APIRouter(prefix="/matches", tags=["matches"])


@router.get("/sesion/{sesion_id}", response_model=list[MatchResponse])
def listar_matches(
    sesion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Devuelve todos los matches de una sesión, ordenados por estado:
    primero dudosos (requieren acción), luego automáticos, luego sin_match.
    """
    # Verificar que la sesión pertenece al usuario
    sesion = db.query(Sesion).filter(
        Sesion.id == sesion_id, Sesion.usuario_id == current_user.id
    ).first()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    matches = (
        db.query(MatchCruzado)
        .filter(MatchCruzado.sesion_id == sesion_id)
        .all()
    )

    # Ordenar: dudosos primero (requieren acción inmediata)
    orden = {"dudoso": 0, "sin_match": 1, "auto_confirmado": 2, "corregido": 3}
    matches.sort(key=lambda m: orden.get(m.estado, 99))
    return matches


@router.patch("/{match_id}", response_model=MatchResponse)
def actualizar_match(
    match_id: int,
    data: MatchUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Actualiza el estado de un match.

    Se marca corregido_por_usuario=True en todos los casos en que el usuario
    interviene manualmente. Estos datos se pueden usar en el futuro para
    mejorar los umbrales del motor o entrenar un modelo propio.

    Casos de uso:
    - Confirmar un match dudoso → estado="auto_confirmado"
    - Rechazar un match → estado="sin_match"
    - Deshacer un auto-match → estado="dudoso"
    - Asignar manualmente a una entidad → estado="corregido" + entidad_id
    """
    # Verificar que el match pertenece a una sesión del usuario (evita acceso cruzado)
    match = (
        db.query(MatchCruzado)
        .join(Sesion, Sesion.id == MatchCruzado.sesion_id)
        .filter(
            MatchCruzado.id == match_id,
            Sesion.usuario_id == current_user.id,
        )
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match no encontrado")

    # Aplicar solo los campos que el cliente envió
    if data.estado is not None:
        match.estado = data.estado
    if data.fuente1_nombre is not None:
        match.fuente1_nombre = data.fuente1_nombre
    if data.fuente2_nombre is not None:
        match.fuente2_nombre = data.fuente2_nombre
    if data.fuente3_nombre is not None:
        match.fuente3_nombre = data.fuente3_nombre
    if data.entidad_id is not None:
        match.entidad_id = data.entidad_id

    # Siempre marcar como corregido por usuario cuando hay intervención manual
    match.corregido_por_usuario = True

    # Guardar en memoria global de matches
    tipo_fuente2 = "dnit" if match.fuente2_nombre else "marketing"
    nombre_fuente2 = match.fuente2_nombre or match.fuente3_nombre

    if match.fuente1_nombre and nombre_fuente2:
        mg = db.query(MatchGlobal).filter(
            MatchGlobal.nombre_erp     == match.fuente1_nombre,
            MatchGlobal.nombre_fuente2 == nombre_fuente2,
            MatchGlobal.tipo_fuente2   == tipo_fuente2,
        ).first()

        nuevo_estado = ("confirmado" if data.estado in
                       ["auto_confirmado", "corregido"] else "rechazado")

        if mg:
            mg.estado     = nuevo_estado
            mg.updated_at = datetime.utcnow()
        else:
            db.add(MatchGlobal(
                nombre_erp     = match.fuente1_nombre,
                nombre_fuente2 = nombre_fuente2,
                tipo_fuente2   = tipo_fuente2,
                score          = match.score,
                estado         = nuevo_estado,
                confirmado_por = current_user.id,
            ))

    db.commit()
    db.refresh(match)
    return match
