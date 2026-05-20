from sqlalchemy import Column, Integer, String, Float, ForeignKey
from app.utils.database import Base


class DatoMarketing(Base):
    __tablename__ = "datos_marketing"

    id = Column(Integer, primary_key=True, index=True)
    sesion_id = Column(Integer, ForeignKey("sesiones.id"), nullable=False, index=True)
    archivo_id = Column(Integer, ForeignKey("archivos_subidos.id"), nullable=False)

    anunciante = Column(String, nullable=False, index=True)
    rubroprincipal = Column(String, nullable=True)
    tipodecluster = Column(String, nullable=True)
    puntajetotal = Column(Float, nullable=True)
    cultura = Column(Float, nullable=True)
    ejecucion = Column(Float, nullable=True)
    estructura = Column(Float, nullable=True)
    competitividad = Column(Float, nullable=True)
    inv_total_gs = Column(Float, nullable=True)
    inv_total_usd = Column(Float, nullable=True)
    n_registros = Column(Integer, nullable=True)
