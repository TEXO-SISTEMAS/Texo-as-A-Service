# Capa 02 — Inteligencia de Marketing

Página: `public/marketing.html`. Ver [[Arquitectura]], [[Asistente IA]].

## Qué es

Mapa del holding (las 6 agencias, sus redes globales, clientes), contexto del mercado publicitario paraguayo, noticias del sector, y alertas estratégicas generadas por IA.

## Datos

A diferencia de Salud Financiera y AdLens, esta capa **no tiene un dataset propio subido** — combina:

- `HOLDING_DATA` — info estática de las 6 agencias (hardcodeada en `server.js`): red global (WPP, Publicis, Omnicom/IPG, independiente), años, clientes, dato destacado.
- `MERCADO_DATA` — tamaño del mercado PY (fallback estático, US$135.5M 2024), reemplazable por intel generada.
- **Noticias:** scraping de Google News RSS (`/api/marketing/news`, `/api/marketing/redes-news`), cacheado 30min-1h.
- **Intel generada por IA:** `POST /api/marketing/refresh` con `tipo: alertas|redes|mercado` — le pide a Claude Haiku que genere JSON con alertas/briefings/datos de mercado actualizados, se guarda en Drive (`marketing-<tipo>.json`).

## Asistente de IA

Comparte el endpoint `/api/chat` con Salud Financiera, diferenciado por `context: 'marketing'`. **No manda datos reales al modelo** — el prompt tiene `HOLDING_DATA`/`MERCADO_DATA` hardcodeados como texto estático. Pendiente si se decide cablear datos reales — ver [[Decisiones y pendientes]].
