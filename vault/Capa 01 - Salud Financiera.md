# Capa 01 — Salud Financiera

Página: `public/index.html`. Ver [[Arquitectura]], [[Glosario]], [[Asistente IA]].

## Qué mide

Rentabilidad real de las 5 agencias del grupo (BRICK, NASTA, LUPE, OMD, ROGER) y del holding en conjunto. Fuente: Excel **"SALUD FINANCIERA POR ARENA POAS"**, una hoja `SALUD <AGENCIA>` por agencia + hoja `CONSOLIDADO AGENCIAS`. Parseado por `parser.js`. Todos los montos vienen en **miles de guaraníes**.

## Estructura de la página

- **Barra compacta (siempre visible, arriba):** Score grupal, estado (rentables/en pérdida), dependencia 3709, cantidad de agencias/personas.
- **Grid de 6 tarjetas (intro):** una por sección, con objetivo y link directo (`openSection()`).
- **Recorrido detallado (01 a 06), navegable por pestañas (`section-nav`):**
  1. Rentabilidad de las 2 arenas (CC y DC)
  2. Sin 3709 — rentabilidad real
  3. Eficiencia — rendimiento de inversión y per cápita
  4. Aporte de innovación
  5. Expertise foco
  6. Concentración de fee
  7. *(pestaña agregada sep 2026)* Ingresos 2026 — dataset distinto, ver abajo
- **"Resumen Ejecutivo" (desactivado sep 2026):** estaba al final del scroll, duplicaba el score de la barra compacta. Comentado en el código, no borrado — ver [[Decisiones y pendientes]].

## Las 2 arenas

- **CC — Creación de Contenido:** Activación/Producción, Asesorías, Branding, Creatividad, Estrategias, Otras Innovaciones, PR/Influencer, Social Media.
- **DC — Distribución de Contenido:** OFF (medios tradicionales), ON (medios digitales), Performance.

## Fórmulas

```
REVENUE                = FACTURACIÓN − COSTOS
EBITDA                 = REVENUE − GASTOS_RRHH − GASTOS_COMERCIALES − GASTOS_ADMIN
Margen                 = EBITDA / Revenue
Margen sin 3709        = EBITDA_sin3709 / Revenue
Rendimiento inversión   = EBITDA / Total_Egresos
Per cápita EBITDA       = EBITDA / Personas_promedio  (viene directo del Excel, fila PERCAPITA)
Aporte de innovación    = cc_otras_innovaciones + cc_pr_influencer + cc_social_media
Expertise foco          = sub-arena CC con mayor facturación
Concentración de fee    = Expertise_foco / Total_CC   (verde <50%, amarillo 50-70%, rojo ≥70%)
```

Ver [[Glosario]] para el beneficio fiscal 3709.

## Score grupal (0-10)

```
margenPct = (EBITDA_total_grupo / Facturación_total_grupo) × 100
score = min(10, margenPct / 2)
      + 1    si NINGUNA agencia tiene EBITDA negativo
      − 0.5  por cada agencia dependiente del 3709 (ebitda_sin3709 < 0 pero ebitda >= 0)
      − 1.5  por cada agencia con EBITDA negativo
score = clamp(score, 0, 10)
```

Color: ≥7 verde, 4-6.9 amarillo, <4 rojo. Estado del grupo: verde si todas rentables, amarillo si todas menos una, rojo si 2+.

## Campos del parser (`parser.js`)

`nombre, facturacion_total, facturacion_cc, facturacion_dc, revenue_total, revenue_cc, revenue_dc, costos_total, ebitda, ebitda_sin3709, ebitda_dc, ebitda_cc, gastos_rrhh, gastos_comerciales, gastos_admin, total_egresos, percapita_ebitda, cantidad_personas, monto3709, cc_activacion_prod, cc_asesorias, cc_branding, cc_creatividad, cc_estrategias, cc_otras_innovaciones, cc_pr_influencer, cc_social_media, dc_off, dc_on, dc_performance, aporte_innovacion`

## Detalle de Ingresos 2026

Sección aparte, dataset distinto (transaccional, en vivo, ENERO–JUNIO 2026) del mismo Excel de Salud Financiera 2025. Se sube por separado (`ingresos_parser.js`, `POST /api/upload-ingresos`). Tiene su propio EBITDA/P&L interno. El asistente de IA cita "Según los datos de Salud Financiera" para el Excel 2025 y "Según el Detalle de Ingresos 2026" para este dataset — no mezclar.

## Unidades — cuidado acá

Los campos crudos vienen en **miles de Gs.** Para mostrar "millones de Gs." se divide por **mil**, no por un millón — hubo un bug real (sep 2026) donde varios gráficos dividían por 1e6 y mostraban valores **1000 veces más chicos** de lo real. Ver [[Decisiones y pendientes]]. El helper correcto en el frontend es `fmtMM()` (index.html); en el asistente de IA (`server.js`) es el `fmt` local de la rama SF de `/api/chat`.
