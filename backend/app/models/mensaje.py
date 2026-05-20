from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON, func
from sqlalchemy.orm import relationship
from app.utils.database import Base


class Mensaje(Base):
    """
    Mensaje individual en una conversación.

    rol: 'user' o 'assistant'
    contenido: texto del mensaje
    grafico_json: si la IA generó un gráfico, acá va la spec de Plotly (puede ser null)
    """
    __tablename__ = "mensajes"

    id = Column(Integer, primary_key=True, index=True)
    conversacion_id = Column(Integer, ForeignKey("conversaciones.id"), nullable=False)
    rol = Column(String, nullable=False)              # 'user' | 'assistant'
    contenido = Column(Text, nullable=False)
    grafico_json = Column(JSON, nullable=True)        # spec Plotly si aplica
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversacion = relationship("Conversacion", back_populates="mensajes")
