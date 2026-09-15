# Inversión de Medios

**Ya no es una capa aparte (sep 2026).** Antes vivía en `/globalnum` con su
propio link en el nav de las otras 3 capas; ahora es la pestaña
**"09 · Inversión de Medios"** dentro de [[Capa 01 - Salud Financiera]]
(`public/index.html`), migrada con toda su funcionalidad (gráficos, tablas
cruzadas, detalle filtrable, desglose mensual/trimestral/semestral). El nav
de AdLens/Marketing/Salud Financiera y la tarjeta de `/home` ya no linkean a
`/globalnum`.

Antes se llamó "Global Num" en la UI (renombrado sep 2026, previo a esta
migración); el código interno (`globalnum.html`, `globalnum_parser.js`,
rutas `/globalnum` y `/api/*-globalnum`) sigue usando ese nombre viejo — no
se tocó a propósito, ni al renombrar ni al migrar, porque cambiar rutas
rompería enlaces existentes.

**`public/globalnum.html` sigue existiendo y funcionando standalone** (con
su propio asistente de IA, `/api/ask-globalnum` — ver más abajo) pero ya no
tiene ningún link hacia ella; solo accesible tipeando la URL directamente.
El código nuevo de la pestaña, en `public/index.html`, es una migración
independiente — usa los mismos endpoints de datos (`/api/save-globalnum`,
`/api/latest-globalnum`) pero todo el JS/CSS de renderizado está reescrito
con prefijo `gn`/`Gn` para no chocar con nombres ya usados en Salud
Financiera. Ver [[Arquitectura]], [[Asistente IA]], [[Decisiones y pendientes]].

## Qué es

Inversión publicitaria por agencia, medio y cliente — seguimiento mensual/trimestral/semestral. Fuente: Excel subido, parseado **en el browser** (`globalnum_parser.js`, para evitar el límite de tamaño de request), el servidor solo guarda el JSON resultante en Drive (`globalnum-latest.json`).

## Estructura de la página (reordenada sep 2026)

Orden actual: Agencias/Medios → resto de gráficos y tablas → **Inversión Mensual/Trimestral/Semestral** (último) → **Detalle de inversión** (tabla, justo después). Antes el orden era al revés (el período iba primero); se movió porque tenía más sentido terminar con el detalle transaccional.

## Formato de cifras — regla estricta (sep 2026)

A pedido explícito de Danilo, **todo el módulo muestra el número completo, sin abreviar**: puntos como separador de miles, símbolo **"Gs" al final**. Ejemplo: `65.495.179.490 Gs`. Nada de "65,5 mil millones" ni "65M".

- Helper: `groupGs(v)` en `globalnum.html` (frontend) y `fmtB` en la rama `/api/ask-globalnum` de `server.js` (asistente de IA) — ambos hacen lo mismo: `Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.') + ' Gs'`.
- Ejes de los gráficos: se dejaron con marcas limitadas (`maxTicksLimit: 4`) para que el número completo no sature, pero también sin abreviar.
- El asistente de IA tiene la regla explícita en el system prompt: prohibido usar "millones"/"miles de millones"/"billones", prohibido abreviar.

**"Com:"** en los gráficos = comisión (lo que gana la agencia sobre la inversión de ese mes/período, típicamente ~3%). Ver `% Com.` en la tabla de detalle para el porcentaje real.

## Asistente de IA

Endpoint propio: `POST /api/ask-globalnum` (no comparte el `/api/chat` genérico). Recibe `summary` armado en el cliente (`_gnSummary`), no directo del servidor. Ver [[Asistente IA]].

La migración a pestaña (arriba) portó el dashboard completo pero **no** el chat "Analista de Inversión" propio — habría chocado de ids con el chat de Salud Financiera (`btnChat`/`chatSidebar`/`toggleChat`, sin sufijo GN a diferencia del resto de sus elementos). En cambio, el asistente de IA de Salud Financiera ahora **también conoce estos datos** (sep 2026): `renderGn()` guarda `window._gnData`, `sendChat()` lo manda al `/api/chat` junto con `data`/`ingresosData`, y el servidor arma un resumen por agencia/medio (cifras completas, sin abreviar) que se suma al `bloqueDatos` — mismo patrón que Ingresos 2026, re-filtrado server-side por `req.user.agencia` como capa de seguridad extra. Ver [[Decisiones y pendientes]].
