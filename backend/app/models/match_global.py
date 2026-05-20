from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from app.utils.database import Base


class MatchGlobal(Base):
    __tablename__ = "matches_globales"

    id = Column(Integer, primary_key=True, index=True)
    nombre_erp = Column(String, nullable=False, index=True)
    nombre_fuente2 = Column(String, nullable=False)
    tipo_fuente2 = Column(String, nullable=False)
    score = Column(Float, nullable=True)
    estado = Column(String, nullable=False)
    confirmado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
