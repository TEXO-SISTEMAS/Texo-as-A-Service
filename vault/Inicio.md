# Texo as a Service — Vault

Documentación interna del proyecto. Actualizar a mano cuando algo cambie de fondo (esto no se genera solo).

## Mapa rápido

- [[Arquitectura]] — qué está deployado de verdad, stack, variables de entorno
- **Módulos (capas), sep 2026 en adelante 3 capas + 1 pestaña:**
  - [[Capa 01 - Salud Financiera]] — incluye la pestaña "09 · Inversión de Medios" (ver [[Capa 04 - Inversión de Medios]], ya no es capa aparte)
  - [[Capa 02 - Marketing]]
  - [[Capa 03 - AdLens]]
- [[Asistente IA]] — cómo está armado el chat con IA en cada módulo
- [[Acceso y usuarios]] — login, multi-tenancy por agencia
- [[Glosario]] — 3709, CC/DC, EBITDA, y demás siglas del negocio
- [[Decisiones y pendientes]] — bitácora de decisiones grandes + lo que falta

## Qué es Texo as a Service

El "cerebro digital" del holding Texo (Paraguay): NASTA, BRICK, LUPE, OMD, ROGER, AMPLIFY. Une en una plataforma la inteligencia que hoy vive dispersa — salud financiera, inteligencia de mercado, inversión publicitaria — con un asistente de IA en cada capa.

Target: **CEO y directorio** — ejecutivos no técnicos que necesitan decisiones claras, no dashboards para analistas. Filosofía de diseño: sin tablas crudas por defecto, sin jerga, narrativa clara, síntesis en un número cuando se puede.

## Repo

`https://github.com/TEXO-SISTEMAS/Texo-as-A-Service` — rama `master`, deploy automático a Vercel en cada push.

**Ojo:** el repo tiene carpetas `frontend/` (Next.js) y `backend/` (FastAPI) que **no están deployadas** — son de un proyecto anterior ("AI Data Chat"). No tocar salvo que se decida revivirlas a propósito. Ver [[Arquitectura]].
