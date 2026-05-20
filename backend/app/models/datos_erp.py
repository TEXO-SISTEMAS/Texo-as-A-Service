from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey
from app.utils.database import Base


class DatoERP(Base):
    __tablename__ = "datos_erp"

    id = Column(Integer, primary_key=True, index=True)
    sesion_id = Column(Integer, ForeignKey("sesiones.id"), nullable=False, index=True)
    archivo_id = Column(Integer, ForeignKey("archivos_subidos.id"), nullable=False)

    cliente = Column(String, nullable=False, index=True)
    empresa = Column(String, nullable=True)
    estado = Column(String, nullable=True)
    facturacion = Column(Float, nullable=True)
    costo = Column(Float, nullable=True)
    revenue = Column(Float, nullable=True)
    fecha_factura = Column(Date, nullable=True)
    ano = Column(Integer, nullable=True, index=True)
