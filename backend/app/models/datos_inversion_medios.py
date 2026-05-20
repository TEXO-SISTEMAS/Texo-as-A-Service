from sqlalchemy import Column, Integer, String, Float, ForeignKey
from app.utils.database import Base


class DatoInversionMedios(Base):
    __tablename__ = "datos_inversion_medios"

    id         = Column(Integer, primary_key=True, index=True)
    sesion_id  = Column(Integer, ForeignKey("sesiones.id"), nullable=False, index=True)
    archivo_id = Column(Integer, ForeignKey("archivos_subidos.id"), nullable=False)

    setor             = Column(String, nullable=True)
    categoria         = Column(String, nullable=True)
    anunciante        = Column(String, nullable=False, index=True)
    agencia           = Column(String, nullable=True)
    medio             = Column(String, nullable=True, index=True)
    veiculo           = Column(String, nullable=True)
    grupo_empresarial = Column(String, nullable=True)
    mes               = Column(String, nullable=True)
    ano               = Column(Integer, nullable=True, index=True)
    monto_gs          = Column(Float, nullable=True)
    monto_usd         = Column(Float, nullable=True)
    descuento_pct     = Column(Float, nullable=True)
    rango_inversion   = Column(Float, nullable=True)
