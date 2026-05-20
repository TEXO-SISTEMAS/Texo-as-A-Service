from sqlalchemy import Column, Integer, String, Float, ForeignKey
from app.utils.database import Base


class DatoDNIT(Base):
    __tablename__ = "datos_dnit"

    id = Column(Integer, primary_key=True, index=True)
    sesion_id = Column(Integer, ForeignKey("sesiones.id"), nullable=False, index=True)
    archivo_id = Column(Integer, ForeignKey("archivos_subidos.id"), nullable=False)

    nombre_empresa = Column(String, nullable=False, index=True)
    ruc = Column(String, nullable=True, index=True)
    razon_social = Column(String, nullable=True)
    ranking = Column(Integer, nullable=True)
    aporte_gs = Column(Float, nullable=True)
    ingreso_estimado_gs = Column(Float, nullable=True)
