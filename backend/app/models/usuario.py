from sqlalchemy import Column, Integer, String, DateTime, func
from app.utils.database import Base


class Usuario(Base):
    """Tabla de usuarios del sistema. Login simple con email y contraseña."""
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)      # bcrypt hash, nunca texto plano
    nombre = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
