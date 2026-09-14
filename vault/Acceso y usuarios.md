# Acceso y usuarios (multi-tenancy)

Ver también [[Arquitectura]].

## Login

Google OAuth (`/auth/google` → `/auth/google/callback`) → JWT en cookie httpOnly, 7 días. **El dominio del email NO da acceso por sí solo** — hay que estar explícitamente en una lista:

1. `SUPER_ADMIN` (`danilo.sosa@texo.com.py`) — hardcodeado.
2. `USUARIOS_EXTRA` — hardcodeado en `server.js`.
3. Lista en Drive (`usuarios-permitidos.json`), gestionable desde `/admin`.

Si el email no está en ninguna, redirige a `/login?error=no_access` aunque tenga una cuenta Google válida del dominio de una agencia.

## Resolución de agencia

```
1. Super admin / USUARIOS_EXTRA → null (acceso completo, ve todo)
2. Lista de Drive → agencia asignada manualmente (prioridad sobre el dominio)
3. Dominio del email (@nasta.com.py → NASTA, etc.) → agencia automática
4. Sin match → null (acceso completo)
```

JWT lleva `{ email, name, picture, agencia }`. `agencia: null` = ve todo.

## Filtrado server-side por capa

| Función | Qué filtra |
|---|---|
| `filtrarAgencias()` | array de agencias (Salud Financiera) |
| `filtrarIngresos()` | Detalle de Ingresos + recalcula totales |
| `filtrarGlobalnum()` | agencias, matrices mes×agencia y medio×agencia, totales |
| `filtrarAdlens()` | `por_agencia[]`, `mediosDetalle[]` |

Marketing **no se filtra** — es inteligencia de mercado general, no hay datos por agencia que proteger.

## Restricción en el asistente de IA

Se inyecta como texto en el system prompt: *"⚠️ RESTRICCIÓN: Solo acceso a datos de {agencia}..."*. Los datos en sí ya vienen pre-filtrados server-side antes de armar el prompt — la restricción de texto es una capa extra, no la única protección.

## Historial de chat personal

Cada usuario ve solo sus propias conversaciones de Salud Financiera — nombre de archivo `chat-sf-{AGENCIA}-{email_at_dominio}-{timestamp}.json`, filtrado client-side por prefijo + doble verificación (nombre + campo `agencia` dentro del JSON).

## Admin panel (`/admin`, solo `danilo.sosa@texo.com.py`)

- Gestión de usuarios permitidos + su agencia asignada.
- Panel de uso de IA (ver [[Asistente IA]]).
- Botón para borrar todo el historial de chats de todos los usuarios (con doble confirmación — acción irreversible).
