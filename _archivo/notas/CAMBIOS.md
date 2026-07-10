# Documento de Cambios — texo_as_a_service

**Fecha:** Mayo 2026  
**Proyecto:** Sistema de análisis de datos comerciales con IA  
**Stack:** FastAPI + PostgreSQL + Next.js + Claude API

---

## Resumen ejecutivo

Se realizaron seis mejoras al sistema original, todas orientadas a hacer el chat más inteligente, más rápido y más barato. El cambio más importante es el reemplazo del enfoque de "JSON pre-armado" por **Tool Use**, que permite a Claude decidir qué datos necesita en lugar de recibir un resumen fijo. Los gráficos también se implementaron como herramienta, eliminando errores de JSON mal formado.

---

## Cambio 1 — Modelo de IA

### Antes
```
Modelo: claude-opus-4-5
Costo input:  $15 por millón de tokens
Costo output: $75 por millón de tokens
Velocidad:    Lenta
```

### Después
```
Modelo: claude-sonnet-4-6
Costo input:  $3 por millón de tokens
Costo output: $15 por millón de tokens
Velocidad:    Notablemente más rápido
```

### Impacto
- **5x más barato** sin pérdida de calidad para análisis de datos
- Respuestas más rápidas para el usuario

### Archivo modificado
- `backend/app/services/chat_engine.py` — línea del modelo

---

## Cambio 2 — Prompt Caching de Anthropic

### Antes
```
Cada mensaje enviaba el system prompt completo a Claude
→ Se cobraban todos los tokens en cada llamada
```

### Después
```
El system prompt se marca como cacheable
→ Tras el primer uso, se cobra al 90% menos
```

### Cómo funciona
Claude guarda el system prompt en caché por 5 minutos. Si el mismo system prompt llega en la próxima llamada, cobra el 90% menos de esos tokens.

```
Mensaje 1: system prompt → cobra tokens completos + guarda en caché
Mensaje 2: system prompt → CACHE HIT → 90% más barato
Mensaje 3: system prompt → CACHE HIT → 90% más barato
```

### Archivo modificado
- `backend/app/services/chat_engine.py` — header `anthropic-beta: prompt-caching-2024-07-31` y bloque `cache_control`

---

## Cambio 3 — Cache de datos en memoria

### Antes
```
Cada mensaje del usuario relanzaba todo el proceso:
  1. Consultar BD por archivos de la sesión
  2. Leer Excel del disco
  3. Procesar con pandas
  4. Cruzar datos con RapidFuzz
  → Todo esto en CADA mensaje
```

### Después
```
Primera vez: consulta BD + lee Excel + procesa → guarda en memoria
Mensajes siguientes: usa los datos ya cargados en memoria
  → Sin lectura de disco
  → Sin reprocesamiento
```

### Cuándo se invalida el caché
Cuando el usuario sube un archivo nuevo a la sesión, el caché se borra automáticamente para que el próximo mensaje cargue los datos frescos.

### Archivos modificados
- `backend/app/services/chat_engine.py` — diccionario `_cache_datos` y función `invalidar_cache_sesion`
- `backend/app/routes/sesiones.py` — llama a `invalidar_cache_sesion` al subir archivos

---

## Cambio 4 — Datos en PostgreSQL (eliminación de lectura de Excel en el chat)

### Antes
```
Flujo al subir un archivo:
  1. Guardar Excel en disco ✓
  2. Registrar ruta en BD   ✓
  3. Importar datos a BD    ✗ ← NO se hacía

Flujo al chatear:
  → Python releía el Excel del disco en cada mensaje
  → Si se borraba el Excel, se perdían los datos
  → Lento (I/O de disco)
```

### Después
```
Flujo al subir un archivo:
  1. Guardar Excel en disco         ✓
  2. Registrar ruta en BD           ✓
  3. Importar datos a BD            ✓ ← NUEVO

Flujo al chatear:
  → Python consulta PostgreSQL directamente
  → Si se borra el Excel, los datos siguen en BD
  → Rápido (query en BD vs lectura de archivo)
```

### Nuevas tablas creadas

| Tabla | Contenido |
|---|---|
| `datos_erp` | Filas del ERP: cliente, facturación, revenue, costo, fecha, año |
| `datos_dnit` | Ranking DNIT: nombre empresa, ranking, ingreso estimado |
| `datos_marketing` | Adlens: anunciante, inversión en medios, puntaje de madurez |

### Archivos creados
- `backend/app/models/datos_erp.py`
- `backend/app/models/datos_dnit.py`
- `backend/app/models/datos_marketing.py`
- `backend/app/services/importar_datos.py`
- `backend/alembic/versions/0003_add_datos_fuentes.py`

### Archivos modificados
- `backend/app/services/sesion_service.py` — llama a `importar_excel` al subir
- `backend/app/models/__init__.py` — registra los nuevos modelos

---

## Cambio 5 — Tool Use (el más importante)

### El problema de fondo

El sistema original construía un JSON fijo con datos pre-calculados y se lo mandaba a Claude. Claude solo podía responder con lo que estaba en ese JSON.

```
Antes:
  Python decide QUÉ datos mandar
         ↓
  Claude recibe JSON fijo
         ↓
  Claude interpreta y responde
  
  Limitación: Si Python no incluyó el dato, Claude no puede responderlo.
  Limitación: Preguntas complejas que requieren múltiples perspectivas fallan.
```

### La solución: Tool Use

Claude ahora decide qué datos necesita y los pide directamente.

```
Ahora:
  Claude recibe la pregunta + definición de herramientas disponibles
         ↓
  Claude decide qué datos necesita
         ↓
  Claude llama herramientas (hasta 8 rondas)
         ↓
  Python ejecuta queries en PostgreSQL y devuelve resultados
         ↓
  Claude razona sobre los resultados
         ↓
  Claude responde con análisis preciso
```

### Herramientas disponibles

| Herramienta | Qué hace | Cuándo Claude la usa |
|---|---|---|
| `get_resumen_sesion` | Años disponibles, totales, fuentes cargadas | Como primer paso para orientarse |
| `get_clientes_erp` | Rankings de clientes con facturación, revenue, costo | Preguntas de ventas, top N, comparativas |
| `get_evolucion_cliente` | Evolución año a año de un cliente | Tendencias históricas de un cliente |
| `get_detalle_mensual` | Desglose mes a mes | Estacionalidad, análisis de períodos |
| `get_dnit` | Empresas del DNIT con ranking e ingreso | Análisis de mercado |
| `get_marketing` | Inversión publicitaria y madurez por anunciante | Análisis de inversión publicitaria |
| `cruzar_cliente` | Perfil completo ERP + DNIT + Marketing de un cliente | Perfil integral de un cliente |
| `get_oportunidades` | Empresas del DNIT que NO son clientes del ERP | Identificar oportunidades de captación |

### Ejemplo de pregunta compleja

**Pregunta:** "¿Qué clientes tienen alta facturación pero baja inversión publicitaria y están entre los top 50 del DNIT?"

**Antes:** Claude recibía un JSON genérico, respondía con datos parciales o inventaba.

**Ahora:**
```
Claude piensa: necesito tres fuentes de datos

Ronda 1: llama get_clientes_erp(ano=2024, limite=100)
         → recibe ranking completo de clientes con facturación

Ronda 2: llama get_marketing()
         → recibe inversión publicitaria de todos los anunciantes

Ronda 3: llama get_dnit(limite=50)
         → recibe las 50 empresas más grandes del mercado

Claude cruza los tres resultados y responde:
"Los clientes con alta facturación pero baja inversión publicitaria
 que están en el top 50 del DNIT son: ..."
```

### Archivo modificado
- `backend/app/services/chat_engine.py` — reescritura completa

---

## Flujo completo del sistema actual

```
┌─────────────┐
│   USUARIO   │
└──────┬──────┘
       │ Sube Excel
       ▼
┌─────────────────────────────────────────┐
│              FastAPI Backend            │
│                                         │
│  1. Guarda Excel en disco               │
│  2. Detecta columnas con IA             │
│  3. Importa datos a PostgreSQL          │
│  4. Invalida caché de sesión            │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│  PostgreSQL │  ← datos_erp, datos_dnit, datos_marketing
└─────────────┘

       ┌─────────────┐
       │   USUARIO   │
       └──────┬──────┘
              │ Escribe pregunta en el chat
              ▼
┌─────────────────────────────────────────┐
│              FastAPI Backend            │
│                                         │
│  1. Verifica rate limit                 │
│  2. Carga historial (últimos 6 msgs)    │
│  3. Envía a Claude con herramientas     │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│            Claude Sonnet 4.6            │
│                                         │
│  Decide qué herramientas necesita       │
│  Llama herramientas (hasta 8 rondas)    │
│                                         │
│  ← Python ejecuta queries en BD        │
│  ← Python devuelve resultados           │
│                                         │
│  Sintetiza respuesta en español         │
│  Genera gráfico Plotly si se pidió      │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│              FastAPI Backend            │
│                                         │
│  Extrae gráfico Plotly si existe        │
│  Guarda pregunta + respuesta en BD      │
│  Devuelve respuesta al frontend         │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────┐
│  Next.js    │  ← muestra texto + gráfico interactivo
└─────────────┘
```

---

## Cambio 6 — Gráficos como herramienta

### El problema anterior

Claude generaba gráficos escribiendo JSON de Plotly directamente dentro de su respuesta de texto, usando marcadores especiales:

```
Claude respondía:
"Aquí el gráfico:
<<<PLOTLY_START>>>
{"data": [{"type": "bar", "x": ["Coca Cola", "Pepsi"], "y": [8500000, 3200000]}], ...}
<<<PLOTLY_END>>>"
```

Problemas:
- Claude podía escribir JSON malformado → gráfico no aparecía
- Claude usaba valores aproximados en lugar de los exactos de la BD
- Sin formato automático para números grandes (Guaraníes)
- Sin validación antes de enviar al frontend

### Después

Claude llama la herramienta `generar_grafico` con datos estructurados. Python construye el JSON correctamente.

```
Claude llama: generar_grafico(
  tipo    = "bar",
  titulo  = "Top 10 clientes por facturación 2024",
  series  = [{"nombre": "Facturación Gs.", "x": ["Coca Cola", "Pepsi", ...], "y": [8500000, 3200000, ...]}],
  eje_y   = "Guaraníes"
)
        ↓
Python construye el JSON de Plotly con:
  ✓ Formato automático para valores > 1.000.000 (tickformat: ",.0f")
  ✓ Detección de años en eje X (type: "category")
  ✓ JSON siempre válido
        ↓
Python devuelve confirmación a Claude (sin el JSON completo)
Claude escribe el texto de la respuesta normalmente
El gráfico queda capturado en el loop y se envía al frontend
```

### Flujo completo con gráfico

```
Usuario: "Mostrá un gráfico de ventas por cliente en 2024"
        ↓
Claude llama: get_clientes_erp(ano=2024, limite=10)
        ↓ recibe datos reales de la BD
Claude llama: generar_grafico(tipo="bar", titulo="...", series=[{x: clientes, y: facturaciones}])
        ↓ Python construye Plotly JSON
Claude recibe: {"status": "grafico_generado", "titulo": "..."}
        ↓
Claude escribe: "Aquí están las ventas por cliente en 2024..."
        ↓
Frontend muestra texto + gráfico interactivo de Plotly
```

### Archivos modificados
- `backend/app/services/chat_engine.py`:
  - Nueva función `_tool_generar_grafico`
  - Nueva entrada en `HERRAMIENTAS` con schema completo
  - Nueva entrada en dispatch de `ejecutar_herramienta`
  - `_ejecutar_loop_tools` ahora captura `grafico_json` del tool result y retorna `tuple[str, dict | None]`
  - `procesar_mensaje` usa el gráfico del loop en vez de extraerlo del texto

---

## Cambio 7 — Corrección de código muerto en dashboard.py

### El problema

Al migrar los datos de Excel a PostgreSQL (Cambio 4) y reescribir `chat_engine.py` con Tool Use (Cambio 5), tres funciones quedaron eliminadas de `chat_engine.py`:

```python
# Estas funciones ya NO existen en chat_engine.py
_cargar_erp_df(archivo)
_cargar_dnit_df(archivo)
_cargar_marketing_unificado(archivo_base, archivo_medios)
```

Sin embargo, `dashboard.py` seguía importándolas:

```python
# Línea 13 de dashboard.py — IMPORT ROTO
from app.services.chat_engine import _cargar_erp_df, _cargar_dnit_df, _cargar_marketing_unificado
```

Esto causaría un `ImportError` en el momento en que cualquier usuario abra el dashboard, dejándolo completamente inoperable.

Además, `dashboard.py` tenía 4 sentencias `print()` de debug que quedaron del desarrollo.

### Qué se corrigió

**Import roto → imports de modelos correctos:**

```python
# Antes (roto)
from app.services.chat_engine import _cargar_erp_df, _cargar_dnit_df, _cargar_marketing_unificado

# Después
from app.models.datos_erp import DatoERP
from app.models.datos_dnit import DatoDNIT
from app.models.datos_marketing import DatoMarketing
```

**Carga de datos: Excel del disco → consulta directa a PostgreSQL:**

```python
# Antes (leía Excel del disco via funciones eliminadas)
erp_df = _cargar_erp_df(archivo_erp) if archivo_erp else None
dnit_df = _cargar_dnit_df(archivo_dnit) if archivo_dnit else None
marketing_df = _cargar_marketing_unificado(archivo_marketing_base, archivo_marketing_medios)

# Después (consulta PostgreSQL, construye DataFrame con las mismas columnas)
erp_df = None
if archivo_erp:
    filas = db.query(DatoERP).filter(DatoERP.sesion_id == sesion_id).all()
    if filas:
        erp_df = pd.DataFrame([{
            "CLIENTE": r.cliente, "EMPRESA": r.empresa,
            "FACTURACION": r.facturacion, "COSTO": r.costo,
            "REVENUE": r.revenue, "AÑO": r.ano, ...
        } for r in filas])
# (igual para dnit_df y marketing_df)
```

**4 sentencias `print()` de debug eliminadas** de las funciones `get_dashboard` y `_procesar_dnit`.

### Archivo modificado
- `backend/app/routes/dashboard.py` — import, carga de datos, prints de debug

---

## Comparativa general antes / después

| Aspecto | Antes | Después |
|---|---|---|
| Modelo IA | claude-opus-4-5 | claude-sonnet-4-6 |
| Costo por mensaje | ~$0.015 | ~$0.003 |
| Datos en el chat | Lee Excel del disco | Consulta PostgreSQL |
| Si se borra el Excel | Se pierden los datos | Los datos siguen en BD |
| Velocidad mensajes 2,3,4... | Siempre relento (disco) | Rápido (caché en memoria) |
| Preguntas simples | ✓ Funcionaba | ✓ Funciona mejor |
| Preguntas complejas | ✗ Datos parciales | ✓ Claude pide lo que necesita |
| Desglose mensual | ✗ No disponible | ✓ Herramienta dedicada |
| Perfil integral de cliente | ✗ Parcial | ✓ Cruza ERP+DNIT+Marketing |
| Oportunidades de mercado | ✗ Limitado | ✓ Herramienta dedicada |
| Gráficos | ⚠ Claude escribía JSON (podía fallar) | ✓ Python construye JSON siempre válido |
| Formato Guaraníes en gráficos | ✗ Sin formato | ✓ Automático para valores > 1M |
| Tokens del system prompt | Cobrados completo | 90% más barato (caché) |
| Dashboard | ✗ ImportError al abrir (funciones eliminadas) | ✓ Consulta PostgreSQL directamente |

---

## Pasos pendientes para producción (AWS)

1. **Re-subir los archivos Excel** en sesiones existentes para que los datos se importen a PostgreSQL con el nuevo sistema.
2. **Corregir Dockerfile del frontend** — cambiar `npm run dev` por `npm run build && npm start`.
3. **Configurar variables de entorno** en AWS (Secrets Manager o SSM).
4. **Actualizar CORS** del backend para permitir el dominio de producción en lugar de `localhost:3000`.
5. **Apuntar `DATABASE_URL`** a una instancia RDS en lugar de localhost.
6. Lanzar en EC2 `t3.medium` (4GB RAM recomendado) con `docker-compose up -d`.
