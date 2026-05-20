from pydantic import BaseModel
from typing import Optional


class MatchResponse(BaseModel):
    id: int
    sesion_id: int
    entidad_id: Optional[int]
    fuente1_nombre: Optional[str]
    fuente2_nombre: Optional[str]
    fuente3_nombre: Optional[str]
    score: Optional[float]
    estado: str
    corregido_por_usuario: bool

    class Config:
        from_attributes = True


class MatchUpdate(BaseModel):
    """
    Payload para PATCH /matches/{id}.
    Todos los campos son opcionales — solo se actualizan los que se envíen.

    estado: nuevo estado elegido por el usuario
      "auto_confirmado" → el usuario confirmó el match
      "sin_match"       → el usuario marcó que son empresas distintas
      "corregido"       → el usuario asignó manualmente a otra entidad

    fuente1_nombre / fuente2_nombre / fuente3_nombre:
      Se pueden corregir si el usuario quiere asignar el nombre correcto.

    entidad_id:
      Para asignación manual desde la sección "sin match".
    """
    estado: Optional[str] = None
    fuente1_nombre: Optional[str] = None
    fuente2_nombre: Optional[str] = None
    fuente3_nombre: Optional[str] = None
    entidad_id: Optional[int] = None
