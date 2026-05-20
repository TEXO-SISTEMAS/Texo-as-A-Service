from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.utils.database import Base


class MatchCruzado(Base):
    """
    Resultado del cruce entre fuentes para una entidad en una sesión.

    estado:
      'auto_confirmado'  → score > 85%, cruzado automáticamente
      'pendiente'        → score 60-85%, espera confirmación del usuario
      'sin_match'        → score < 60%, no se pudo cruzar
      'corregido'        → el usuario corrigió el match manualmente

    fuente1_nombre, fuente2_nombre, fuente3_nombre:
      el nombre tal como apareció en cada Excel (puede ser null si no aplica)
    """
    __tablename__ = "matches_cruzados"

    id = Column(Integer, primary_key=True, index=True)
    sesion_id = Column(Integer, ForeignKey("sesiones.id"), nullable=False)
    entidad_id = Column(Integer, ForeignKey("entidades.id"), nullable=True)
    fuente1_nombre = Column(String, nullable=True)   # nombre en ERP
    fuente2_nombre = Column(String, nullable=True)   # nombre en DNIT
    fuente3_nombre = Column(String, nullable=True)   # nombre en Marketing
    score = Column(Float, nullable=True)             # 0.0 a 1.0
    estado = Column(String, nullable=False, default="pendiente")
    corregido_por_usuario = Column(Boolean, default=False)

    sesion = relationship("Sesion", back_populates="matches")
    entidad = relationship("Entidad", backref="matches")
