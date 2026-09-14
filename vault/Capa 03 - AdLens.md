# Capa 03 — AdLens

Página: `public/adlens.html`. Ver [[Arquitectura]], [[Asistente IA]].

## Qué es

Inteligencia de mercado publicitario paraguayo: inversión, anunciantes, grupos económicos, medios, Market Maturity Index (MMI), media mix, clusters.

## Fuente de datos — BigQuery en vivo

A diferencia de las otras capas, AdLens **no depende de un Excel subido**: lee en vivo de BigQuery, las mismas tablas que alimentan el Looker del equipo.

- **Proyecto GCP:** `adlenslooker`, dataset `adlensmedios`.
- **Tablas:** `tablamaterializada_adlens` (199 empresas, 94 columnas) y `tablamaterializada_medios` (262k filas a nivel inserción).
- **Conexión:** `bigquery.js` → `buildAdlensData()`. Endpoint `GET /api/adlens/bigquery`, cache en memoria 1h (`?refresh=1` fuerza).
- **Credencial:** `GCP_SA_KEY` (JSON de la service account, en base64 en Vercel).
- **Fallback:** si BigQuery falla, cae a los últimos datos guardados en Drive (flujo Excel viejo, en desuso).

## Columnas clave

- `rangodeinversion` (FLOAT, en miles de USD → ×1000 = USD)
- `facturacion` (STRING, en miles → SAFE_CAST)
- `npuntajetotal`, `Cluster`
- Scores `Cultura/ejecucion/Estructura/Competitividad/inversion` (fracción 0-1, ×100 para %)
- `formulapc1`/`formulapc2` (scatter PC1/PC2)
- **Medios:** `GS`, `US_`, `RANGODEINVERSION`, `A__O`, `MES` (DATE), `anunciante`, `Medio`, `GrupoEmpresarial`, `Agencia`, `Scetor`

## KPIs validados contra el Looker

- Total Inversión = SUM(rango)×1000 = US$46.86M
- Anunciantes = 198 (inner join medios ∩ adlens por anunciante)
- MMI = AVG(npuntajetotal) = 81.2
- Invest/billing = SUM(rango)/SUM(facturacion) = 0.7%
- **Facturación** (la más difícil de resolver): `SUM(SAFE_CAST(a.facturacion AS FLOAT64))` sobre el INNER JOIN medios∩adlens, **sin deduplicar** — el Looker repite la facturación de cada empresa por cada fila de medios que tiene. El SUM limpio (deduplicado) da un número distinto, más chico.

## Pendiente conocido

Los `anunciante` en BigQuery vienen en MAYÚSCULAS sin espacios (`GENOMMALAB`, `BANCOFAMILIAR`). `formatNombre()` en el frontend aplica Title Case, pero nombres pegados sin separador quedan como una palabra. Falta un mapa de corrección manual (`NOMBRE_MAP`). Ver [[Decisiones y pendientes]].
