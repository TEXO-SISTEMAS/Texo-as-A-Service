# Capa 04 — Inversión de Medios

Antes llamada "Global Num" en la UI (renombrado sep 2026); el código interno
(`globalnum.html`, `globalnum_parser.js`, rutas `/globalnum` y
`/api/*-globalnum`) sigue usando el nombre viejo — no se tocó a propósito.

Página: `public/globalnum.html`. Ver [[Arquitectura]], [[Asistente IA]].

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
