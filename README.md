# AI Data Chat

App web local de análisis conversacional de datos comerciales. Permite subir archivos Excel de tres fuentes (ERP, DNIT, Marketing), cruzarlos inteligentemente y hacer preguntas en lenguaje natural con generación de gráficos interactivos.

---

## Requisitos previos

| Herramienta | Versión mínima | Para qué |
|---|---|---|
| Python | 3.11+ | Backend FastAPI |
| Node.js | 18+ | Frontend Next.js |
| Docker Desktop | Cualquiera reciente | Base de datos PostgreSQL |
| Git | Cualquiera | Clonar el repositorio |

Verificar instalaciones:
```bash
python --version
node --version
docker --version
```

---

## 1. Levantar PostgreSQL con Docker

```bash
# Desde la raíz del proyecto
docker compose up -d
```

Esto levanta PostgreSQL 16 con la extensión pgvector en el puerto 5432.
Los datos persisten en un volumen Docker aunque se apague el contenedor.

Verificar que está corriendo:
```bash
docker ps
```

---

## 2. Configurar el backend

### 2a. Crear el entorno virtual e instalar dependencias

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
```

> La primera vez `sentence-transformers` descarga el modelo `all-MiniLM-L6-v2` (~90MB).

### 2b. Configurar variables de entorno

```bash
# Copiar la plantilla
cp .env.example .env
```

Editar `.env` y completar:

```env
MISTRAL_API_KEY=tu_clave_de_mistral
ANTHROPIC_API_KEY=tu_clave_de_claude   # opcional si usás solo Mistral
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_data_chat
JWT_SECRET_KEY=cambia_esto_por_una_clave_larga_y_aleatoria
ACTIVE_AI_MODEL=mistral                # o "claude"
EMBEDDING_MODEL=all-MiniLM-L6-v2
REGISTRO_HABILITADO=true
CHAT_RATE_LIMIT=20
```

> Para generar una `JWT_SECRET_KEY` segura:
> ```bash
> python -c "import secrets; print(secrets.token_hex(32))"
> ```

### 2c. Correr las migraciones (crear las tablas)

```bash
# Desde /backend, con el venv activado
alembic upgrade head
```

Esto crea las 7 tablas en la base de datos: `usuarios`, `sesiones`, `archivos_subidos`, `entidades`, `matches_cruzados`, `conversaciones`, `mensajes`.

### 2d. Crear el primer usuario

Con el backend corriendo (paso 2e), ejecutar:

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","password":"tu_password","nombre":"Tu Nombre"}'
```

Luego **deshabilitar el registro** en `.env`:
```env
REGISTRO_HABILITADO=false
```

### 2e. Levantar el backend

```bash
# Desde /backend, con el venv activado
uvicorn main:app --reload
```

El backend queda disponible en: `http://localhost:8000`
Documentación automática: `http://localhost:8000/docs`

---

## 3. Configurar el frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend queda disponible en: `http://localhost:3000`

> La primera vez `npm install` puede tardar unos minutos descargando dependencias.

---

## 4. Flujo de uso

1. Abrir `http://localhost:3000` → redirige a `/login`
2. Ingresar con el usuario creado en el paso 2d
3. Crear una nueva sesión de análisis
4. Subir los archivos Excel (ERP, DNIT, Marketing)
5. Ejecutar el cruce de datos y revisar matches
6. Confirmar los matches dudosos
7. Ir al chat y hacer preguntas sobre los datos

---

## 5. Correr los tests del backend

```bash
cd backend
pytest tests/ -v
```

Los tests de entity resolution no requieren base de datos ni API keys.

---

## 6. Estructura del proyecto

```
texo_as_a_service/
├── docker-compose.yml          # PostgreSQL + pgvector
├── README.md
├── .gitignore
├── backend/
│   ├── main.py                 # Entrada FastAPI
│   ├── requirements.txt
│   ├── .env.example            # Plantilla de variables de entorno
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   │       └── 0001_initial.py # Migración inicial
│   ├── data/uploads/           # Archivos Excel subidos (no commitear)
│   ├── tests/
│   │   └── test_entity_resolver.py
│   └── app/
│       ├── models/             # Tablas SQLAlchemy
│       ├── routes/             # Endpoints FastAPI
│       ├── services/           # Lógica de negocio
│       │   ├── auth_service.py
│       │   ├── chat_engine.py
│       │   ├── column_detector.py
│       │   ├── cruce_service.py
│       │   ├── entity_resolver.py
│       │   ├── sesion_service.py
│       │   └── system_prompt.txt  # Prompt de la IA (editable)
│       ├── schemas/            # Validación Pydantic
│       └── utils/              # DB, dependencias JWT
└── frontend/
    ├── package.json
    ├── tailwind.config.js
    └── src/
        ├── app/                # Páginas Next.js (App Router)
        ├── components/         # Componentes reutilizables
        ├── hooks/              # useAuth, useChat, useMatches, useSesion
        └── lib/                # Cliente axios
```

---

## 7. Variables de entorno — referencia completa

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | URL de conexión a PostgreSQL |
| `JWT_SECRET_KEY` | Sí | Clave para firmar tokens JWT |
| `MISTRAL_API_KEY` | Si usás Mistral | API key de Mistral |
| `ANTHROPIC_API_KEY` | Si usás Claude | API key de Anthropic |
| `ACTIVE_AI_MODEL` | No (default: mistral) | `mistral` o `claude` |
| `EMBEDDING_MODEL` | No (default: all-MiniLM-L6-v2) | Modelo de embeddings |
| `REGISTRO_HABILITADO` | No (default: true) | `false` después del primer usuario |
| `CHAT_RATE_LIMIT` | No (default: 20) | Máx mensajes/minuto por usuario |

---

## 8. Solución de problemas frecuentes

**`alembic upgrade head` falla con "extension vector does not exist"**
→ Verificar que el contenedor Docker esté corriendo con `docker ps`. La imagen `pgvector/pgvector:pg16` incluye la extensión, pero debe estar activa.

**El modelo de embeddings no descarga**
→ Requiere conexión a internet la primera vez. Ejecutar `python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"` para forzar la descarga.

**Error 503 al enviar mensajes al chat**
→ Verificar que `MISTRAL_API_KEY` o `ANTHROPIC_API_KEY` estén correctamente configuradas en `.env`.

**El frontend muestra error de CORS**
→ Verificar que el backend esté corriendo en `http://localhost:8000` y el frontend en `http://localhost:3000`.
