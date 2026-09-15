# Decisiones y pendientes

Bitácora de decisiones grandes (más reciente primero) + lo que queda por hacer. Actualizar a mano.

## Pendientes activos

- [ ] **AdLens y Marketing sin datos reales en el asistente de IA.** Cablear `bigquery.buildAdlensData()`+`filtrarAdlens()` y `HOLDING_DATA`/intel de Drive respectivamente. Ver [[Asistente IA]].
- [ ] **Voz solo en Salud Financiera** (piloto). Replicar a AdLens, Marketing si el piloto funciona bien (Inversión de Medios ya no es un módulo aparte).
- [ ] **Avatar del bot** solo en Salud Financiera (header del chat + favicon). Replicar a los otros 3 módulos si se quiere consistencia visual.
- [ ] **Nombres de anunciantes de AdLens** vienen pegados sin espacios desde BigQuery (`BANCOFAMILIAR`). Falta mapa de corrección manual (`NOMBRE_MAP`).
- [ ] **Prompt caching** en el asistente de SF — se intentó con `system` como array + `cache_control`, rompió la respuesta, se revirtió a string plano. Si se reintenta, probar con cuidado.
- [ ] **`claude-sonnet-5`** (modelo más nuevo y más barato) falló al probarlo — evaluar reintentar.
- [ ] **`knowledge/capa_01_salud_financiera/`** — 6 notas .md con wikilinks, no comiteadas, ningún código las lee. Eran la semilla de un plan de RAG que se descartó a favor del "brief liviano" (metodología hardcodeada en el prompt). Decidir si se borran, se comitean como referencia, o se retoman si algún día se gradúa al merge completo.

## Decisiones grandes — bitácora

**Sep 2026 — Rediseño del asistente de IA: "brief liviano", no el merge completo.**
Se evaluaron dos caminos (ver [[Asistente IA]]). Se eligió: sin `lib/jarvis.js`, sin corpus de notas en Drive, sin RAG — un system prompt en 3 partes (persona estática + metodología estática por sección + datos dinámicos), escrito a mano. ~2-3 días de trabajo vs. ~2 semanas del merge completo.

**Sep 2026 — Persona "Jarvis mayordomo".** Tono seco, educado, con filo. Se probó "sir" como tratamiento, Danilo pidió sacarlo y usar el nombre real del usuario en su lugar.

**Sep 2026 — Voz con Web Speech API + ElevenLabs.** Piloto en Salud Financiera. Voz nativa del navegador de entrada (gratis) y salida (gratis, con fallback si ElevenLabs no está configurado o falla).

**Sep 2026 — Bug de unidades: "1000 veces más chico" en varios lugares.** Encontrado en 3 rondas distintas: (1) el bloque DATOS que recibe el asistente de SF, (2) el gráfico "EBITDA Per Cápita" del dashboard principal, (3) los 8 gráficos que dispara el asistente con `[[CHART:key]]`, (4) 9 gráficos más del dashboard principal. Causa raíz repetida: dividir por un millón cuando el campo ya viene en miles (debía dividirse por mil), o mezclar un valor ya dividido con una unidad pensada para el valor crudo. Fix: helper `fmtMM()` centralizado, "millones de Gs." completo en vez de abreviar.

**Sep 2026 — Inversión de Medios (antes "Global Num"): cifras completas, sin abreviar.** A pedido explícito, todo el módulo (UI + asistente) muestra el número completo con puntos de miles y "Gs" al final — nada de "M"/"B"/"millones"/"mil millones". Ver [[Capa 04 - Inversión de Medios]].

**Sep 2026 — Renombre "Global Num" → "Inversión de Medios".** Cambio de nombre visible en toda la UI (nav de las 4 capas, tarjeta de inicio, panel admin) y dentro del propio módulo, que además usaba internamente "Inversión Publicitaria" — quedó unificado. No se tocaron rutas, nombres de archivo ni endpoints internos (`/globalnum`, `globalnum.html`, `/api/*-globalnum`).

**Sep 2026 — Inversión de Medios deja de ser una capa aparte, pasa a ser la pestaña "09" de Salud Financiera.** Migración completa del dashboard (6 gráficos, tablas cruzadas, detalle filtrable, desglose mensual/trimestral/semestral) a `public/index.html`, reutilizando los mismos endpoints de datos. Se sacó el link del nav de las otras capas y de `/home`; `/globalnum` sigue funcionando standalone (con su asistente de IA propio) pero sin acceso directo desde ningún menú. Ver [[Capa 04 - Inversión de Medios]].

**Sep 2026 — El chat de Salud Financiera ahora conoce Inversión de Medios (3ra fuente).** Mismo patrón que Ingresos 2026: el cliente manda `window._gnData` (ya filtrado por agencia) en el POST a `/api/chat`, el servidor arma un resumen por agencia/medio con cifras completas sin abreviar y re-filtra server-side por seguridad. `METODOLOGIA_SF` actualizada para citar las 3 fuentes por separado sin mezclar cifras. Se sacó AMPLIFY del selector "ver como agencia" — no tiene datos propios en ningún dataset cargado hoy (se investigó si "VIA PUBLICA" en Detalle de Ingresos era AMPLIFY mal etiquetada; no lo es, es una línea de producción trade distinta).

**Sep 2026 — Topbar responsive roto en anchos intermedios.** El logo se partía en 2-3 líneas y los botones quedaban fuera de pantalla en laptops con la ventana achicada (y en mobile real). Corregido en los 4 módulos: topbar fluido que envuelve a 2ª/3ª fila en vez de partir texto.

**Sep 2026 — "Resumen Ejecutivo" desactivado (comentado, no borrado).** Duplicaba el score que ya está en la barra compacta de arriba. Ver [[Capa 01 - Salud Financiera]].

**Sep 2026 — Pestaña "07 · Ingresos 2026" agregada.** Esa sección estaba al final del scroll sin acceso directo.

**Sep 2026 — Tracking de uso/costo de IA.** Antes no existía ningún registro. Ahora cada respuesta se loguea (tokens, costo) en Drive, con panel en `/admin`.

**Sep 2026 — Sistema de acceso por agencia completado.** OAuth con lista explícita (el dominio del email ya no alcanza), filtrado server-side por capa, historial de chat personal por usuario. Ver [[Acceso y usuarios]].
