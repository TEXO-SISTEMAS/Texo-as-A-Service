from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.utils.database import Base


class Sesion(Base):
    """
    Sesión de trabajo. Un usuario puede tener varias sesiones.
    Cada sesión agrupa los archivos subidos, los matches y las conversaciones.
    """
    __tablename__ = "sesiones"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    nombre_sesion = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones — permiten acceder a los datos relacionados desde Python
    usuario = relationship("Usuario", backref="sesiones")
    archivos = relationship("ArchivoSubido", back_populates="sesion")
    matches = relationship("MatchCruzado", back_populates="sesion")
    conversaciones = relationship("Conversacion", back_populates="sesion")
