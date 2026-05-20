from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
import os

from app.models.usuario import Usuario

# --- Configuración de bcrypt ---
# bcrypt aplica un "work factor" costoso computacionalmente, lo que hace que
# un atacante con la BD no pueda probar millones de contraseñas por segundo.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- Configuración de JWT ---
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "CAMBIA_ESTO_EN_PRODUCCION")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8  # el token dura 8 horas — tras eso el usuario debe volver a loguear


def hash_password(plain_password: str) -> str:
    """Convierte la contraseña en texto plano a un hash bcrypt."""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed: str) -> bool:
    """Compara la contraseña ingresada contra el hash guardado en BD."""
    return pwd_context.verify(plain_password, hashed)


def create_access_token(user_id: int) -> str:
    """
    Genera un JWT firmado con el SECRET_KEY.
    El payload incluye:
      - sub: ID del usuario (sujeto del token)
      - exp: timestamp de expiración (8 horas)
    """
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> int:
    """
    Decodifica y valida el JWT.
    Lanza HTTPException 401 si el token es inválido o expiró.
    Devuelve el user_id.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
        return user_id
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_user_by_email(db: Session, email: str) -> Usuario | None:
    return db.query(Usuario).filter(Usuario.email == email).first()


def get_user_by_id(db: Session, user_id: int) -> Usuario | None:
    return db.query(Usuario).filter(Usuario.id == user_id).first()


def authenticate_user(db: Session, email: str, password: str) -> Usuario:
    """
    Verifica email + contraseña.
    Lanza 401 si el usuario no existe o la contraseña no coincide.
    IMPORTANTE: el mensaje de error es genérico a propósito — no revela
    si el email existe en la base de datos (evita user enumeration).
    """
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
        )
    return user


def create_user(db: Session, email: str, password: str, nombre: str) -> Usuario:
    """Crea un nuevo usuario con la contraseña hasheada."""
    if get_user_by_email(db, email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un usuario con ese email",
        )
    user = Usuario(
        email=email,
        password_hash=hash_password(password),
        nombre=nombre,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
