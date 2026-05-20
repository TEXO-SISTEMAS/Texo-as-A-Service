from pydantic import BaseModel
from datetime import datetime
from typing import Any


class SesionCreate(BaseModel):
    nombre_sesion: str


class SesionUpdate(BaseModel):
    nombre_sesion: str | None = None


class SesionResponse(BaseModel):
    id: int
    usuario_id: int
    nombre_sesion: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class ArchivoResponse(BaseModel):
    id: int
    fuente_tipo: str
    nombre_archivo: str
    columnas_detectadas_json: Any | None

    class Config:
        from_attributes = True
