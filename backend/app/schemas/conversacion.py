from pydantic import BaseModel
from datetime import datetime
from typing import Any


class ConversacionCreate(BaseModel):
    sesion_id: int
    nombre: str | None = None


class ConversacionUpdate(BaseModel):
    nombre: str | None = None


class ConversacionResponse(BaseModel):
    id: int
    sesion_id: int
    usuario_id: int
    nombre: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class MensajeRequest(BaseModel):
    contenido: str


class MensajeResponse(BaseModel):
    id: int
    conversacion_id: int
    rol: str
    contenido: str
    grafico_json: Any | None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatResponse(BaseModel):
    """Lo que devuelve POST /conversaciones/{id}/mensajes."""
    respuesta: str
    grafico_json: Any | None
    mensaje_id: int  # ID del mensaje del asistente guardado en BD
