from fastapi import APIRouter, Depends, Response, HTTPException, status
from sqlalchemy.orm import Session
import os

from app.utils.database import get_db
from app.utils.dependencies import get_current_user
from app.services.auth_service import authenticate_user, create_user, create_access_token
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from app.models.usuario import Usuario

router = APIRouter(prefix="/auth", tags=["auth"])

# Variable de entorno para habilitar/deshabilitar el registro.
# En producción: REGISTRO_HABILITADO=false en .env
REGISTRO_HABILITADO = os.getenv("REGISTRO_HABILITADO", "true").lower() == "true"


@router.post("/register", response_model=UserResponse, status_code=201)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    """
    Crea el primer usuario del sistema.
    Este endpoint debe deshabilitarse después del primer uso
    poniendo REGISTRO_HABILITADO=false en el .env.

    Decisión: no hay registro público. Solo el admin puede crear la cuenta
    inicial, luego se cierra el endpoint para evitar accesos no autorizados.
    """
    if not REGISTRO_HABILITADO:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El registro está deshabilitado",
        )
    user = create_user(db, data.email, data.password, data.nombre)
    return user


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """
    Autentica al usuario y devuelve el JWT.

    Decisiones de seguridad:
    1. El JWT se setea como cookie httpOnly: JavaScript en el navegador
       no puede acceder a ella, lo que neutraliza ataques XSS.
    2. samesite='lax': previene que la cookie se envíe en requests
       cross-site (mitigación básica de CSRF). Para producción usar 'strict'.
    3. secure=False solo para desarrollo local (http). En producción
       cambiar a secure=True para que solo viaje por HTTPS.
    """
    try:
        user = authenticate_user(db, data.email, data.password)
        token = create_access_token(user.id)

        response.set_cookie(
            key="access_token",
            value=token,
            httponly=True,       # JS no puede leer la cookie
            max_age=8 * 3600,   # 8 horas en segundos
            samesite="lax",      # protección básica contra CSRF
            secure=False,        # cambiar a True cuando haya HTTPS
            path="/",            # asegurar que la cookie se envíe a todas las rutas
        )

        return {"access_token": token, "token_type": "bearer"}
    except Exception as e:
        import traceback
        print(f"[login] ERROR: {type(e).__name__}: {str(e)}")
        print(traceback.format_exc())
        raise


@router.post("/logout")
def logout(response: Response):
    """Borra la cookie del cliente eliminando el JWT."""
    response.delete_cookie("access_token", path="/")
    return {"message": "Sesión cerrada"}


# Endpoint público para verificar que el servidor responde
@router.get("/ping")
def ping():
    return {"message": "pong"}


@router.get("/me", response_model=UserResponse)
def me(current_user: Usuario = Depends(get_current_user)):
    """Devuelve los datos del usuario autenticado. Requiere cookie válida."""
    return current_user
