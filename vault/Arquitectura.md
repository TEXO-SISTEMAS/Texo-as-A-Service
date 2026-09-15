# Arquitectura

Ver también [[Inicio]].

## Lo que está deployado en Vercel (producción real)

- **Deploy:** Vercel, automático al pushear a `master`.
- **Servidor:** `server.js` — Node.js + Express, monolítico (~1200+ líneas). Exporta `app` como función serverless; corre standalone en local con `npm start`.
- **Frontend:** 3 páginas HTML estáticas "de capa" en `public/`, sin framework ni build — todo el CSS y JS inline en cada archivo:
  - `index.html` — Salud Financiera, incluye la pestaña "09 · Inversión de Medios" (~4400 líneas)
  - `adlens.html` — AdLens
  - `marketing.html` — Inteligencia de Marketing
  - `globalnum.html` — página vieja de Inversión de Medios (antes "Global Num"), **sin link en ningún nav desde sep 2026** pero sigue online y funcional en `/globalnum`; su dashboard se migró a la pestaña de `index.html` (nombres `gn*`/`Gn*`, no reutiliza el código de este archivo)
  - `home.html`, `login.html`, `admin.html` — páginas de soporte
- **Storage:** Google Drive (vía service account), NO una base de datos tradicional. `drive.js` es el wrapper — todo son archivos JSON en una sola carpeta plana (`DRIVE_FOLDER_ID`), diferenciados por nombre de archivo.
- **IA:** Anthropic Claude SDK (`@anthropic-ai/sdk`) integrado directo en `server.js`. Ver [[Asistente IA]].
- **BigQuery:** para AdLens en vivo (`bigquery.js`), proyecto `adlenslooker`.

## Node pineado a 20.x

`package.json` → `engines.node: "20.x"`. Node 26+ rompe `googleapis` (usado por Drive) con `ERR_STREAM_PREMATURE_CLOSE` al pedir el token OAuth. Si el dashboard dice "Sin datos cargados" y `/api/diag` tira "Premature close", revisar la versión de Node antes que cualquier otra cosa.

## Variables de entorno (Vercel)

| Variable | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | El asistente de IA (todos los módulos) |
| `ELEVENLABS_API_KEY` | Voz de alta calidad del asistente (opcional — sin ella cae a la voz del navegador) |
| `ELEVENLABS_VOICE_ID` | Opcional, default hardcodeado a la voz "Oscar" |
| `GOOGLE_SERVICE_ACCOUNT` | Credencial de la cuenta de servicio para Drive |
| `DRIVE_FOLDER_ID` | Carpeta de Drive donde vive todo |
| `GCP_SA_KEY` | Credencial BigQuery (AdLens), en base64 |
| `JWT_SECRET` | Firma de la cookie de sesión |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth de Google para el login |

## Lo que NO está deployado (existe en el repo, no confundir)

- `frontend/` — Next.js 14 + TypeScript + Tailwind
- `backend/` — FastAPI + SQLAlchemy + PostgreSQL

Son de un proyecto anterior distinto ("AI Data Chat" — cruce de Excels ERP/DNIT/Marketing, local, sin deploy). El `README.md` del repo describe ESE sistema, está desactualizado respecto a lo que corre en producción. Modificar `frontend/`/`backend/` no afecta el sitio real.

## Flujo de datos típico (ej. Salud Financiera)

1. Usuario sube Excel → `POST /api/upload` → `parser.js` extrae datos → se guarda como JSON en Drive.
2. `GET /api/latest` → lee el último upload de Drive → el browser arma todo el HTML del dashboard con esos datos (`renderDashboard()`).
3. Chat → `POST /api/chat` → `server.js` arma el contexto y llama a la API de Anthropic → responde.
4. Historial de chat → se guarda en Drive como JSON, un archivo por conversación.

Cada módulo (AdLens, Marketing) tiene su propia variante de este flujo — ver la nota de cada capa. Inversión de Medios usa el mismo patrón pero dentro de `index.html` (`/api/save-globalnum` y `/api/latest-globalnum`, sin cambios desde que era capa aparte).
