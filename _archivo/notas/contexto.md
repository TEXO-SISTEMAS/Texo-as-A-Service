# CONTEXTO.md — AI Data Chat (Análisis de Clientes)

## 1. DESCRIPCIÓN DEL PROYECTO
App web local de chat con IA que permite a un equipo pequeño subir Excel
de tres fuentes de datos (ERP, DNIT, Marketing), cruzarlos inteligentemente
a pesar de inconsistencias en nombres, y hacer preguntas en lenguaje natural
con generación de gráficos interactivos en tiempo real.

## 2. PROBLEMA QUE RESUELVE
El equipo actualmente cruza manualmente datos de facturación, posicionamiento
y marketing en Excel separados, sin un ID común. Los nombres de empresas están
escritos de forma inconsistente entre fuentes. El objetivo es automatizar ese
cruce y permitir análisis conversacional sobre los datos unificados.

## 3. USUARIOS Y ROLES
- **Usuarios:** Equipo pequeño (2-5 personas), perfil de marketing/análisis comercial
- **Roles MVP:** Login simple usuario/contraseña (sin diferenciación de roles por ahora)
- **Acceso:** Solo local, no expuesto a internet

## 4. TIPO DE APLICACIÓN
- App web local (corre en localhost)
- Backend Python + Frontend React
- Sin despliegue en nube — todos los datos quedan en la máquina

## 5. STACK TÉCNICO CONFIRMADO

| Capa | Tecnología | Versión sugerida |
|---|---|---|
| Backend | Python + FastAPI | Python 3.11+ |
| Frontend | Next.js | 14+ |
| Base de datos | PostgreSQL + pgvector | PostgreSQL 16 |
| ORM | SQLAlchemy + Alembic | — |
| IA (pruebas) | Mistral API | mistral-small o mistral-medium |
| IA (producción) | Claude API (Anthropic) | claude-sonnet-4-6 |
| Embeddings/matching | pgvector + sentence-transformers | modelo: all-MiniLM-L6-v2 |
| Fuzzy matching | RapidFuzz | fallback cuando embeddings no alcanzan |
| Gráficos | Plotly (backend genera JSON) + React renderiza | — |
| Auth | JWT con bcrypt | — |
| Manejo de Excel | pandas + openpyxl | — |

## 6. FUENTES DE DATOS

### Fuente 1 — ERP (Facturación)
- Formato: Excel (.xlsx)
- Datos esperados: nombre cliente, monto facturado, fecha, producto/servicio
- Problema conocido: nombres de empresa inconsistentes

### Fuente 2 — DNIT (Posicionamiento)
- Formato: Excel (.xlsx)
- Datos esperados: nombre empresa, RUC (si aplica), categoría, posición/ranking
- Problema conocido: nombres pueden diferir de ERP y Marketing

### Fuente 3 — Marketing (Inversión)
- Formato: Excel (.xlsx)
- Datos esperados: nombre cliente, canal, inversión, período
- Problema conocido: misma empresa puede aparecer con razón social distinta

## 7. LÓGICA DE CRUCE DE DATOS (ENTITY RESOLUTION)

El cruce entre fuentes se hace por nombre de empresa usando tres capas:

1. **Match exacto** — coincidencia directa de string normalizado (lowercase, sin puntuación)
2. **Fuzzy match (RapidFuzz)** — similitud de texto con umbral configurable (default: 85%)
3. **Semantic match (pgvector + embeddings)** — similitud semántica para casos como
   "Coca Cola SRL" vs "Refrescos Paraguay"

### Comportamiento ante incertidumbre:
- Score alto (>85%): match automático, se marca como "auto-confirmado"
- Score medio (60–85%): se muestra advertencia, el usuario debe confirmar
- Score bajo (<60%): no se cruza, se muestra como "sin match"
- El usuario puede corregir cualquier match manualmente desde la interfaz
- Los matches confirmados por el usuario se guardan para mejorar futuros cruces

## 8. FUNCIONALIDADES DEL MVP

### ✅ Incluidas (todas implementadas)
- [x] Login con usuario y contraseña (JWT)
- [x] Subida de hasta 3 archivos Excel por sesión
- [x] Detección automática de columnas relevantes por IA
- [x] Motor de cruce de entidades (3 capas: exacto + fuzzy + semántico)
- [x] Interfaz de revisión y corrección de matches
- [x] Chat en lenguaje natural sobre los datos unificados
- [x] Generación de gráficos interactivos (barras, líneas, dispersión)
- [x] Historial de conversaciones guardado por usuario
- [x] Switch de modelo IA: Mistral ↔ Claude desde configuración
- [x] Todo corre local, datos nunca salen de la máquina (excepto prompt a API)

### ❌ Excluido del MVP
- Roles diferenciados (admin vs analista)
- Exportación de reportes PDF
- Scheduler para actualización automática de Excel
- Despliegue en servidor o nube
- Integración directa con ERP (solo Excel manual)

## 9. ESTRUCTURA DE BASE DE DATOS
```
usuarios, sesiones, archivos_subidos, entidades, matches_cruzados,
conversaciones, mensajes,
datos_erp, datos_dnit, datos_marketing, match_global
```
El chat usa Claude Tool Use: Claude consulta las tablas de datos mediante
herramientas Python en lugar de recibir un contexto JSON preconstruido.

## 10. FLUJO PRINCIPAL DE USUARIO

1. Usuario hace login
2. Crea nueva sesión y sube los 3 Excel
3. El sistema detecta columnas y normaliza datos
4. Se ejecuta el motor de cruce → muestra resultados con semáforo de confianza
5. Usuario revisa/confirma/corrige los matches dudosos
6. Empieza el chat: hace preguntas en lenguaje natural
7. El sistema genera respuestas + gráficos cuando aplica
8. El historial queda guardado para esa sesión

## 11. CONTEXTO TÉCNICO DEL DESARROLLADOR
- Perfil: técnico no-developer, trabaja con Claude Code en terminal
- No escribir código sin explicar qué hace
- Preferir comandos paso a paso sobre scripts complejos
- Explicar cada decisión de arquitectura cuando sea relevante
- Avisar siempre antes de modificar archivos existentes

## 12. VARIABLES DE ENTORNO NECESARIAS
```
MISTRAL_API_KEY=
ANTHROPIC_API_KEY=
DATABASE_URL=postgresql://localhost:5432/ai_data_chat
JWT_SECRET_KEY=
ACTIVE_AI_MODEL=mistral  # o "claude"
EMBEDDING_MODEL=all-MiniLM-L6-v2
REGISTRO_HABILITADO=true  # poner false después del primer usuario
CHAT_RATE_LIMIT=20
```