from app.utils.database import engine, Base
from app.models.match_global import MatchGlobal

Base.metadata.create_all(bind=engine, tables=[MatchGlobal.__table__])
print("Tabla matches_globales creada")
