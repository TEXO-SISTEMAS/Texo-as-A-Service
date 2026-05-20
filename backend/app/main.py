from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.routes import auth, sesiones, matches, conversaciones, dashboard
from app.routes import ruc as ruc_router
from app.utils.database import engine

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Evento de startup: verifica que la base de datos sea accesible."""
    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        logger.info("Conexión a la base de datos: OK")
    except Exception as e:
        logger.error(f"No se pudo conectar a la base de datos: {e}")
        raise RuntimeError(
            f"Base de datos no disponible: {e}. "
            "Verificá que PostgreSQL esté corriendo (docker compose up -d) "
            "y que DATABASE_URL en .env sea correcta."
        )
    yield


app = FastAPI(
    title="AI Data Chat",
    version="1.0.0",
    description="API de análisis conversacional de datos comerciales",
    lifespan=lifespan,
)

# CORS — permite que el frontend Next.js en localhost:3000 llame al backend
# IMPORTANTE: withCredentials=true requiere orígenes específicos, NO wildcard
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Cookie", "Set-Cookie"],
    expose_headers=["Set-Cookie"],
)

# Routers
app.include_router(auth.router)
app.include_router(sesiones.router)
app.include_router(matches.router)
app.include_router(conversaciones.router)
app.include_router(dashboard.router, prefix="/dashboard")
app.include_router(ruc_router.router)


# Endpoint para verificar CORS - útil para debug
@app.get("/health")
def health():
    return {"status": "ok", "cors": "enabled"}


@app.get("/")
def root():
    return {"status": "ok", "version": "1.0.0"}
