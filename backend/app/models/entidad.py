from sqlalchemy import Column, Integer, String, JSON, Text
from app.utils.database import Base


class Entidad(Base):
    """
    Entidad unificada (empresa/cliente).
    nombre_normalizado: versión canónica del nombre (ej: 'coca cola srl')
    aliases_json: lista de variantes encontradas en las fuentes (ej: ['Coca-Cola SRL', 'COCA COLA'])
    embedding_vector: embedding como texto JSON (pgvector no instalado)
    """
    __tablename__ = "entidades"

    id = Column(Integer, primary_key=True, index=True)
    nombre_normalizado = Column(String, nullable=False, unique=True, index=True)
    aliases_json = Column(JSON, nullable=True)            # lista de nombres alternativos conocidos
    embedding_vector = Column(Text, nullable=True)        # Embedding como texto JSON
