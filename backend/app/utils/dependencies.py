from fastapi import Depends, Cookie, HTTPException, status
from sqlalchemy.orm import Session

from app.utils.database import get_db
from app.services.auth_service import decode_token, get_user_by_id
from app.models.usuario import Usuario


def get_current_user(
    access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> Usuario:
    """
    Dependencia de FastAPI: extrae el JWT desde la cookie httpOnly,
    lo valida y devuelve el usuario autenticado.

    Decisión de seguridad: se lee desde Cookie (no del header Authorization)
    porque el frontend guarda el token en httpOnly cookie, que JavaScript
    no puede leer. Esto protege contra ataques XSS que roben el token.

    Uso en cualquier endpoint protegido:
        @router.get("/algo")
        def algo(user: Usuario = Depends(get_current_user)):
            ...
    """
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado",
        )
    user_id = decode_token(access_token)
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado",
        )
    return user
