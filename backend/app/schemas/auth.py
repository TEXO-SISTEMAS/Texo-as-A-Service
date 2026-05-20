from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    """Datos para crear el primer usuario (endpoint de uso único)."""
    email: EmailStr
    password: str
    nombre: str


class LoginRequest(BaseModel):
    """Credenciales para hacer login."""
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Lo que devuelve /auth/login al cliente."""
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """Datos públicos del usuario (sin password_hash)."""
    id: int
    email: str
    nombre: str

    class Config:
        from_attributes = True  # permite construir desde modelo SQLAlchemy
