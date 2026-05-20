from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, sesiones, matches, conversaciones

app = FastAPI(title="AI Data Chat", version="0.1.0")

# Permite que el frontend Next.js (localhost:3000) se comunique con el backend
# El middleware debe agregarse ANTES de incluir los routers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(sesiones.router)
app.include_router(matches.router)
app.include_router(conversaciones.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "AI Data Chat API corriendo"}
