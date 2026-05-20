from sqlalchemy import Column, Integer, ForeignKey, DateTime, func, String
from sqlalchemy.orm import relationship
from app.utils.database import Base


class Conversacion(Base):
    """
    Hilo de chat dentro de una sesión.
    Una sesión puede tener múltiples conversaciones (el usuario puede empezar de nuevo).
    """
    __tablename__ = "conversaciones"

    id = Column(Integer, primary_key=True, index=True)
    sesion_id = Column(Integer, ForeignKey("sesiones.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    nombre = Column(String, nullable=True)  # Nombre editable por usuario
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sesion = relationship("Sesion", back_populates="conversaciones")
    usuario = relationship("Usuario", backref="conversaciones")
    mensajes = relationship("Mensaje", back_populates="conversacion", order_by="Mensaje.created_at")
