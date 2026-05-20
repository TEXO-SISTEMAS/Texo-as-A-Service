from sqlalchemy import Column, Integer, String, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.utils.database import Base


class ArchivoSubido(Base):
    """
    Registro de cada Excel subido en una sesión.
    fuente_tipo: 'erp', 'dnit' o 'marketing'
    columnas_detectadas_json: lista de columnas que la IA identificó como relevantes
    """
    __tablename__ = "archivos_subidos"

    id = Column(Integer, primary_key=True, index=True)
    sesion_id = Column(Integer, ForeignKey("sesiones.id"), nullable=False)
    fuente_tipo = Column(String, nullable=False)          # 'erp' | 'dnit' | 'marketing'
    nombre_archivo = Column(String, nullable=False)
    path_local = Column(String, nullable=False)           # ruta en disco donde se guardó
    columnas_detectadas_json = Column(JSON, nullable=True) # ej: {"nombre": "Cliente", "monto": "Facturado"}

    sesion = relationship("Sesion", back_populates="archivos")
