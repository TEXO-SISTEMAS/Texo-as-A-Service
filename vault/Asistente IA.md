# Asistente IA

Ver también [[Arquitectura]], [[Decisiones y pendientes]].

## Dirección elegida (sep 2026): "brief liviano"

Se evaluaron dos caminos: un merge completo (`lib/jarvis.js` + corpus de notas en Drive + RAG + endpoint unificado) vs. un ajuste liviano sobre los 4 chats que ya existían. **Se eligió el liviano.** Se gradúa al merge completo si algún día: la metodología de una sección pasa ~2000 palabras, gente no-dev necesita editarla sin tocar código, o se necesita `/api/remember`.

Persona: **"Jarvis, el mayordomo analista"** — seco, educado, con humor contenido, algo de filo. Se saca el "sir" (Danilo lo pidió) y en su lugar usa el **nombre real del usuario logueado** (primer nombre, de `req.user.name`).

## Los 4 chats — estado actual

| Chat | Endpoint | ¿Datos reales? | Modelo |
|---|---|---|---|
| Salud Financiera | `POST /api/chat` (rama default) | Sí | `claude-sonnet-4-5` |
| Global Num | `POST /api/ask-globalnum` | Sí | `claude-sonnet-4-5` |
| Marketing | `POST /api/chat` `context:'marketing'` | **No** — solo prompt estático | `claude-sonnet-4-5` |
| AdLens | `POST /api/chat` `context:'adlens'` | **No** — solo prompt estático | `claude-sonnet-4-5` |

Marketing y AdLens quedaron pendientes de cablear datos reales (ver [[Decisiones y pendientes]]).

## Modelo

`server.js` tiene `const MODEL_CHAT = 'claude-sonnet-4-5'`. Ojo: el código tenía `claude-sonnet-4-6` (ID inválido, nunca existió) durante mucho tiempo — se corrigió sep 2026. `claude-sonnet-5` (el modelo más nuevo, más barato: $2/$10 por MTok vs $3/$15 de 4.5) se probó pero falló en la cuenta — puede ser cuestión de reintentar una vez que haya más uso/verificación en la cuenta de Anthropic.

## System prompt en 3 partes (SF)

1. **`JARVIS_PERSONA`** — estático global (persona + reglas de formato).
2. **`METODOLOGIA_SF`** — estático por sección: definiciones, fórmulas, score grupal exacto, catálogo de `[[CHART:key]]`/`[[SCROLL:id]]`. Escrito a mano, agencia-neutro (sin cifras de ninguna agencia).
3. **Bloque DATOS** — dinámico: restricción de agencia + datos serializados del período.

`system` se manda como **string plano concatenado**, no como array con `cache_control` — se probó el array (para prompt caching) pero rompía la respuesta ("Error: Respuesta inválida"), se revirtió. Si se reintenta cachear, probar con cuidado en un ambiente de test primero.

## Reglas de formato de moneda

- El asistente **nombra la moneda completa**: "guaraníes", nunca "Gs"; "dólares", nunca "USD" ni "$". Regla explícita en `JARVIS_PERSONA`.
- Los montos vienen en miles de Gs. crudos — dividir por **mil** (no por un millón) para "millones de Gs.". Ver el bug real que esto causó en [[Decisiones y pendientes]].

## Voz (piloto en Salud Financiera)

- **Salida:** botón 🔈/🔊 en el header del chat. Primero intenta `POST /api/tts` (proxy server-side a **ElevenLabs**, voz "Oscar", ID `3mmJ2Z5SLZ9OkeZZcv5p` por defecto) — si no hay `ELEVENLABS_API_KEY` o falla, cae automático a la voz nativa del navegador (`speechSynthesis`, gratis, sin límite).
- **Entrada:** botón 🎙, `webkitSpeechRecognition` (Chrome/Edge only), dicta y envía. 100% gratis, no toca ninguna API paga.
- La voz lee la respuesta **completa**, no un resumen — partida en oraciones de ~180 caracteres y encoladas como varios utterances (Chrome corta las respuestas largas leídas como un solo bloque; en varios trozos no se corta).

## Tracking de uso y costo

`server.js`: `logUsage()` registra cada respuesta (tokens in/out, costo calculado con `PRICING_USD_POR_MTOK`) en Drive, un archivo JSON por día (`usage-YYYY-MM-DD.json`). Panel en `/admin` → "Uso de IA": totales, tokens, desglose por módulo y por usuario, rango 7/30/90 días.

**Costo real por respuesta (Sonnet 4.5):** ~1.4 centavos (pregunta simple) a ~3.6 centavos (respuesta larga, varios turnos). Con US$5 de crédito, entre 140 y 350 respuestas.

## Marcadores inline (solo Salud Financiera)

- `[[CHART:key]]` o `[[CHART:key:AGENCIA]]` → el frontend (`renderChatChart`) dibuja un Chart.js dentro del mensaje del chat. Catálogo completo en `METODOLOGIA_SF`.
- `[[SCROLL:id]]` → hace scroll a una sección/gráfico del dashboard.

Ningún otro módulo tiene esto todavía.
