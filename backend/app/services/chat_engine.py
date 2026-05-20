"""
Motor de chat con IA usando Tool Use.

Flujo por mensaje:
1. Claude recibe la pregunta y las definiciones de herramientas disponibles
2. Claude decide qué datos necesita y llama las herramientas
3. Python ejecuta queries en PostgreSQL y devuelve los resultados
4. Claude repite hasta tener todo lo necesario (máx 8 rondas)
5. Claude sintetiza la respuesta final en lenguaje natural
6. Se guarda el intercambio en BD
"""

import os
import json
import re
import time
import httpx
import math
from pathlib import Path
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException
from rapidfuzz import process, fuzz

from app.models.conversacion import Conversacion
from app.models.mensaje import Mensaje
from app.models.datos_erp import DatoERP
from app.models.datos_dnit import DatoDNIT
from app.models.datos_adlens_base import DatoAdlensBase
from app.models.datos_inversion_medios import DatoInversionMedios


# ── System prompt ─────────────────────────────────────────────────────────────

_PROMPT_PATH = Path(__file__).parent / "system_prompt.txt"


def _cargar_system_prompt() -> str:
    try:
        return _PROMPT_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        return "Sos un asistente de análisis de datos comerciales. Respondé en español."


# ── Rate limiting ─────────────────────────────────────────────────────────────

_rate_limit_store: dict[int, list[float]] = defaultdict(list)
RATE_LIMIT_MENSAJES = int(os.getenv("CHAT_RATE_LIMIT", "20"))
RATE_LIMIT_VENTANA = 60

_cache_datos: dict[int, dict] = {}


def invalidar_cache_sesion(sesion_id: int) -> None:
    _cache_datos.pop(sesion_id, None)


def _verificar_rate_limit(usuario_id: int) -> None:
    ahora = time.time()
    ventana_inicio = ahora - RATE_LIMIT_VENTANA
    _rate_limit_store[usuario_id] = [
        t for t in _rate_limit_store[usuario_id] if t > ventana_inicio
    ]
    if len(_rate_limit_store[usuario_id]) >= RATE_LIMIT_MENSAJES:
        raise HTTPException(
            status_code=429,
            detail=f"Límite de {RATE_LIMIT_MENSAJES} mensajes por minuto alcanzado.",
        )
    _rate_limit_store[usuario_id].append(ahora)


# ── Detección de gaps ─────────────────────────────────────────────────────────

DATOS_NO_DISPONIBLES = {
    "mensual":    "desglose mensual de facturación",
    "trimestral": "desglose trimestral de facturación",
    "semestral":  "desglose por semestre",
    "tendencia":  "tendencia histórica (solo tenemos totales 2024)",
    "proyeccion": "proyecciones o forecasts",
    "forecast":   "proyecciones o forecasts",
    "año pasado": "datos de años anteriores",
    "2023":       "datos de 2023",
    "competencia":"datos de competidores",
    "competidor": "datos de competidores",
}


def _detectar_gaps(pregunta: str) -> list:
    pregunta_lower = pregunta.lower()
    return [
        descripcion
        for keyword, descripcion in DATOS_NO_DISPONIBLES.items()
        if keyword in pregunta_lower
    ]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _py(val):
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return int(f) if f == int(f) else round(f, 2)
    except (TypeError, ValueError):
        return str(val)


def _norm(name: str) -> str:
    if not name:
        return ""
    s = str(name).upper()
    s = re.sub(r"\b(SA|SRL|LTDA|S\.A\.|S\.R\.L\.|SACI|SAECA|S\.A\.E\.C\.A\.)\b", "", s)
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _buscar_fuzzy(nombre: str, lista: list[str], cutoff: int = 75) -> str | None:
    if not nombre or not lista:
        return None
    normas = [_norm(c) for c in lista]
    resultado = process.extractOne(
        _norm(nombre), normas,
        scorer=fuzz.token_sort_ratio, score_cutoff=cutoff
    )
    if resultado:
        return lista[normas.index(resultado[0])]
    return None


# ── Implementación de herramientas ────────────────────────────────────────────

def _tool_get_resumen_sesion(db: Session, sesion_id: int) -> dict:
    anos = [
        r.ano for r in
        db.query(DatoERP.ano).filter(
            DatoERP.sesion_id == sesion_id,
            DatoERP.ano.isnot(None)
        ).distinct().order_by(DatoERP.ano).all()
    ]
    total_clientes = db.query(
        func.count(DatoERP.cliente.distinct())
    ).filter(DatoERP.sesion_id == sesion_id).scalar() or 0

    fac_total = 0
    if anos:
        fac_total = db.query(func.sum(DatoERP.facturacion)).filter(
            DatoERP.sesion_id == sesion_id,
            DatoERP.ano == max(anos)
        ).scalar() or 0

    total_dnit = db.query(func.count(DatoDNIT.id)).filter(
        DatoDNIT.sesion_id == sesion_id
    ).scalar() or 0
    total_mkt = db.query(func.count(DatoMarketing.id)).filter(
        DatoMarketing.sesion_id == sesion_id
    ).scalar() or 0

    return {
        "anos_disponibles": anos,
        "ano_mas_reciente": max(anos) if anos else None,
        "total_clientes_erp": total_clientes,
        "facturacion_total_ano_reciente_gs": _py(fac_total),
        "total_empresas_dnit": total_dnit,
        "total_anunciantes_marketing": total_mkt,
        "fuentes_disponibles": {
            "erp": total_clientes > 0,
            "dnit": total_dnit > 0,
            "marketing": total_mkt > 0,
        },
    }


def _tool_get_clientes_erp(
    db: Session, sesion_id: int,
    ano: int | None = None,
    limite: int = 50,
    buscar: str | None = None,
) -> list[dict]:
    q = db.query(
        DatoERP.cliente,
        func.sum(DatoERP.facturacion).label("facturacion"),
        func.sum(DatoERP.revenue).label("revenue"),
        func.sum(DatoERP.costo).label("costo"),
        func.count(DatoERP.id).label("n_registros"),
    ).filter(DatoERP.sesion_id == sesion_id)

    if ano:
        q = q.filter(DatoERP.ano == ano)

    rows = q.group_by(DatoERP.cliente).order_by(
        func.sum(DatoERP.facturacion).desc()
    ).all()

    results = [
        {
            "cliente": r.cliente,
            "facturacion_gs": _py(r.facturacion),
            "revenue_gs": _py(r.revenue),
            "costo_gs": _py(r.costo),
            "n_registros": r.n_registros,
        }
        for r in rows
    ]

    if buscar:
        clientes = [r["cliente"] for r in results]
        match = _buscar_fuzzy(buscar, clientes)
        results = [r for r in results if r["cliente"] == match] if match else []

    return results[:limite]


def _tool_get_evolucion_cliente(
    db: Session, sesion_id: int,
    cliente: str,
) -> dict:
    clientes = [
        r.cliente for r in
        db.query(DatoERP.cliente).filter(
            DatoERP.sesion_id == sesion_id
        ).distinct().all()
    ]
    cliente_real = _buscar_fuzzy(cliente, clientes) or cliente

    rows = db.query(
        DatoERP.ano,
        func.sum(DatoERP.facturacion).label("facturacion"),
        func.sum(DatoERP.revenue).label("revenue"),
        func.sum(DatoERP.costo).label("costo"),
        func.count(DatoERP.id).label("n_registros"),
    ).filter(
        DatoERP.sesion_id == sesion_id,
        DatoERP.cliente == cliente_real,
    ).group_by(DatoERP.ano).order_by(DatoERP.ano).all()

    if not rows:
        return {"error": f"No se encontró el cliente '{cliente}'"}

    return {
        "cliente": cliente_real,
        "evolucion": {
            str(r.ano): {
                "facturacion_gs": _py(r.facturacion),
                "revenue_gs": _py(r.revenue),
                "costo_gs": _py(r.costo),
                "n_registros": r.n_registros,
            }
            for r in rows
        },
    }


def _tool_get_detalle_mensual(
    db: Session, sesion_id: int,
    cliente: str | None = None,
    ano: int | None = None,
) -> list[dict]:
    q = db.query(
        DatoERP.ano,
        func.extract("month", DatoERP.fecha_factura).label("mes"),
        func.sum(DatoERP.facturacion).label("facturacion"),
        func.sum(DatoERP.revenue).label("revenue"),
    ).filter(
        DatoERP.sesion_id == sesion_id,
        DatoERP.fecha_factura.isnot(None),
    )

    if ano:
        q = q.filter(DatoERP.ano == ano)

    if cliente:
        clientes = [
            r.cliente for r in
            db.query(DatoERP.cliente).filter(
                DatoERP.sesion_id == sesion_id
            ).distinct().all()
        ]
        cliente_real = _buscar_fuzzy(cliente, clientes) or cliente
        q = q.filter(DatoERP.cliente == cliente_real)

    rows = q.group_by(DatoERP.ano, "mes").order_by(DatoERP.ano, "mes").all()

    MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
             "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

    return [
        {
            "periodo": f"{MESES[int(r.mes)]} {int(r.ano)}",
            "ano": int(r.ano),
            "mes": int(r.mes),
            "facturacion_gs": _py(r.facturacion),
            "revenue_gs": _py(r.revenue),
        }
        for r in rows
    ]


def _tool_get_dnit(
    db: Session, sesion_id: int,
    limite: int = 50,
    buscar: str | None = None,
) -> list[dict]:
    rows = db.query(DatoDNIT).filter(
        DatoDNIT.sesion_id == sesion_id
    ).order_by(DatoDNIT.ranking).all()

    if buscar:
        nombres = [r.nombre_empresa for r in rows]
        match = _buscar_fuzzy(buscar, nombres)
        rows = [r for r in rows if r.nombre_empresa == match] if match else []

    return [
        {
            "nombre_empresa": r.nombre_empresa,
            "ranking": r.ranking,
            "ingreso_estimado_gs": _py(r.ingreso_estimado_gs),
        }
        for r in rows[:limite]
    ]


def _tool_get_marketing(
    db: Session, sesion_id: int,
    buscar: str | None = None,
) -> list[dict]:
    rows = db.query(DatoAdlensBase).filter(
        DatoAdlensBase.sesion_id == sesion_id
    ).all()

    if buscar:
        nombres = [r.anunciante for r in rows]
        match = _buscar_fuzzy(buscar, nombres, cutoff=65)
        rows = [r for r in rows if r.anunciante == match] if match else []

    return [
        {
            "anunciante": r.anunciante,
            "rubro": r.rubro_principal,
            "central_medios": r.central_de_medios,
            "tipo_empresa": r.tipo_empresa,
            "tipo_marca": r.tipo_marca,
            "cluster": r.cluster,
            "tipo_cluster": r.tipo_cluster,
            "puntaje_madurez": _py(r.puntaje_total),
            "cultura": _py(r.cultura),
            "ejecucion": _py(r.ejecucion),
            "estructura": _py(r.estructura),
            "competitividad": _py(r.competitividad),
            "inversion": _py(r.inversion),
            "inv_tv_abierta_usd": _py(r.inv_tv_abierta_usd),
            "inv_radio_usd": _py(r.inv_radio_usd),
            "inv_cable_usd": _py(r.inv_cable_usd),
            "inv_revistas_usd": _py(r.inv_revistas_usd),
            "inv_diarios_usd": _py(r.inv_diarios_usd),
            "inv_pdv_usd": _py(r.inv_pdv_usd),
            "rango_inversion": _py(r.rango_inversion),
            "tiene_crm": r.tiene_crm,
            "invierte_digital": r.invierte_marketing_digital,
            "invierte_research": r.invierte_research,
            "perfil_empresa": r.perfil_empresa,
            "estadio_brand_funnel": r.estadio_brand_funnel,
            "medios_principales": r.medios_principales,
        }
        for r in rows
    ]


def _tool_get_inversion_detalle(
    db: Session, sesion_id: int,
    buscar: str | None = None,
    medio: str | None = None,
    ano: int | None = None,
) -> list[dict]:
    q = db.query(DatoInversionMedios).filter(
        DatoInversionMedios.sesion_id == sesion_id
    )
    if medio:
        q = q.filter(DatoInversionMedios.medio.ilike(f"%{medio}%"))
    if ano:
        q = q.filter(DatoInversionMedios.ano == ano)

    rows = q.all()

    if buscar:
        nombres = list({r.anunciante for r in rows})
        match = _buscar_fuzzy(buscar, nombres, cutoff=65)
        rows = [r for r in rows if r.anunciante == match] if match else []

    return [
        {
            "anunciante": r.anunciante,
            "sector": r.setor,
            "categoria": r.categoria,
            "agencia": r.agencia,
            "medio": r.medio,
            "vehiculo": r.veiculo,
            "grupo_empresarial": r.grupo_empresarial,
            "mes": r.mes,
            "ano": r.ano,
            "monto_gs": _py(r.monto_gs),
            "monto_usd": _py(r.monto_usd),
            "descuento_pct": _py(r.descuento_pct),
            "rango_inversion": _py(r.rango_inversion),
        }
        for r in rows
    ]


def _tool_cruzar_cliente(
    db: Session, sesion_id: int,
    cliente: str,
) -> dict:
    clientes_erp = [
        r.cliente for r in
        db.query(DatoERP.cliente).filter(
            DatoERP.sesion_id == sesion_id
        ).distinct().all()
    ]
    cliente_erp = _buscar_fuzzy(cliente, clientes_erp)

    erp_data = None
    if cliente_erp:
        rows = db.query(
            DatoERP.ano,
            func.sum(DatoERP.facturacion).label("facturacion"),
            func.sum(DatoERP.revenue).label("revenue"),
            func.sum(DatoERP.costo).label("costo"),
        ).filter(
            DatoERP.sesion_id == sesion_id,
            DatoERP.cliente == cliente_erp,
        ).group_by(DatoERP.ano).order_by(DatoERP.ano).all()
        erp_data = {
            "nombre_erp": cliente_erp,
            "por_ano": {
                str(r.ano): {
                    "facturacion_gs": _py(r.facturacion),
                    "revenue_gs": _py(r.revenue),
                    "costo_gs": _py(r.costo),
                }
                for r in rows
            },
        }

    dnit_rows = db.query(DatoDNIT).filter(DatoDNIT.sesion_id == sesion_id).all()
    nombre_dnit = _buscar_fuzzy(cliente, [r.nombre_empresa for r in dnit_rows])
    dnit_data = None
    if nombre_dnit:
        fila = next((r for r in dnit_rows if r.nombre_empresa == nombre_dnit), None)
        if fila:
            dnit_data = {
                "nombre_dnit": nombre_dnit,
                "ranking": fila.ranking,
                "ingreso_estimado_gs": _py(fila.ingreso_estimado_gs),
            }

    mkt_rows = db.query(DatoAdlensBase).filter(DatoAdlensBase.sesion_id == sesion_id).all()
    nombre_mkt = _buscar_fuzzy(cliente, [r.anunciante for r in mkt_rows], cutoff=65)
    mkt_data = None
    if nombre_mkt:
        fila = next((r for r in mkt_rows if r.anunciante == nombre_mkt), None)
        if fila:
            mkt_data = {
                "nombre_mkt": nombre_mkt,
                "puntaje_madurez": _py(fila.puntaje_total),
                "cluster": _py(fila.cluster),
                "tipo_cluster": _py(fila.tipo_cluster),
                "cultura": _py(fila.cultura),
                "ejecucion": _py(fila.ejecucion),
                "estructura": _py(fila.estructura),
                "competitividad": _py(fila.competitividad),
                "inv_tv_abierta_usd": _py(fila.inv_tv_abierta_usd),
                "inv_radio_usd": _py(fila.inv_radio_usd),
                "inv_cable_usd": _py(fila.inv_cable_usd),
                "medios_principales": fila.medios_principales,
                "tiene_crm": fila.tiene_crm,
                "invierte_digital": fila.invierte_marketing_digital,
            }

    if not erp_data and not dnit_data and not mkt_data:
        return {"error": f"No se encontró '{cliente}' en ninguna fuente de datos"}

    return {
        "cliente_buscado": cliente,
        "erp": erp_data,
        "dnit": dnit_data,
        "marketing": mkt_data,
    }


def _tool_get_oportunidades(
    db: Session, sesion_id: int,
    limite: int = 20,
) -> list[dict]:
    clientes_erp_norm = {
        _norm(r.cliente)
        for r in db.query(DatoERP.cliente).filter(
            DatoERP.sesion_id == sesion_id
        ).distinct().all()
    }

    dnit_rows = db.query(DatoDNIT).filter(
        DatoDNIT.sesion_id == sesion_id
    ).order_by(DatoDNIT.ranking).all()

    oportunidades = []
    for r in dnit_rows:
        match = process.extractOne(
            _norm(r.nombre_empresa), clientes_erp_norm,
            scorer=fuzz.token_sort_ratio, score_cutoff=75
        )
        if not match:
            oportunidades.append({
                "nombre_empresa": r.nombre_empresa,
                "ranking_dnit": r.ranking,
                "ingreso_estimado_gs": _py(r.ingreso_estimado_gs),
            })
        if len(oportunidades) >= limite:
            break

    return oportunidades


def _tool_generar_grafico(
    tipo: str,
    titulo: str,
    series: list[dict],
    eje_x: str = "",
    eje_y: str = "",
) -> dict:
    """
    Construye un objeto Plotly válido a partir de datos estructurados.
    Claude pasa los datos; Python construye el JSON con formato correcto.

    tipo: "bar" | "line" | "pie" | "scatter"
    series: [{"nombre": str, "x": [...], "y": [...]}]
    """
    data = []
    for s in series:
        if tipo == "pie":
            data.append({
                "type": "pie",
                "labels": s.get("x", []),
                "values": s.get("y", []),
                "name": s.get("nombre", ""),
            })
        else:
            data.append({
                "type": tipo,
                "name": s.get("nombre", ""),
                "x": [str(v) for v in s.get("x", [])],
                "y": s.get("y", []),
            })

    all_y = [v for s in series for v in s.get("y", []) if isinstance(v, (int, float))]
    es_guaranies = bool(all_y) and max(all_y) > 1_000_000

    x_vals = series[0].get("x", []) if series else []
    son_anos = bool(x_vals) and all(
        str(v).strip() in [str(y) for y in range(2000, 2031)] for v in x_vals
    )

    layout: dict = {
        "title": titulo,
        "plot_bgcolor": "white",
        "paper_bgcolor": "white",
        "xaxis": {"title": eje_x},
        "yaxis": {"title": eje_y},
    }

    if son_anos:
        layout["xaxis"]["type"] = "category"

    if es_guaranies:
        layout["yaxis"]["tickformat"] = ",.0f"
        layout["yaxis"]["exponentformat"] = "none"

    return {
        "status": "grafico_generado",
        "titulo": titulo,
        "grafico_json": {"data": data, "layout": layout},
    }


def ejecutar_herramienta(db: Session, sesion_id: int, nombre: str, params: dict):
    try:
        dispatch = {
            "get_resumen_sesion":    lambda: _tool_get_resumen_sesion(db, sesion_id),
            "get_clientes_erp":      lambda: _tool_get_clientes_erp(db, sesion_id, **params),
            "get_evolucion_cliente": lambda: _tool_get_evolucion_cliente(db, sesion_id, **params),
            "get_detalle_mensual":   lambda: _tool_get_detalle_mensual(db, sesion_id, **params),
            "get_dnit":              lambda: _tool_get_dnit(db, sesion_id, **params),
            "get_marketing":          lambda: _tool_get_marketing(db, sesion_id, **params),
            "get_inversion_detalle":  lambda: _tool_get_inversion_detalle(db, sesion_id, **params),
            "cruzar_cliente":        lambda: _tool_cruzar_cliente(db, sesion_id, **params),
            "get_oportunidades":     lambda: _tool_get_oportunidades(db, sesion_id, **params),
            "generar_grafico":       lambda: _tool_generar_grafico(**params),
        }
        if nombre not in dispatch:
            return {"error": f"Herramienta desconocida: {nombre}"}
        return dispatch[nombre]()
    except Exception as e:
        return {"error": str(e)}


# ── Definición de herramientas para Claude ────────────────────────────────────

HERRAMIENTAS = [
    {
        "name": "get_resumen_sesion",
        "description": "Resumen de datos disponibles: años, total clientes, fuentes cargadas. Usar como primer paso si no sabés qué datos hay.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_clientes_erp",
        "description": "Clientes del ERP con facturación, revenue y costo agregados. Usar para rankings, comparativas, análisis financiero.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ano":    {"type": "integer", "description": "Filtrar por año (ej: 2024). Omitir para todos los años."},
                "limite": {"type": "integer", "description": "Máximo de clientes (default: 50)."},
                "buscar": {"type": "string",  "description": "Nombre parcial de un cliente específico."},
            },
        },
    },
    {
        "name": "get_evolucion_cliente",
        "description": "Evolución año a año de un cliente: facturación, revenue y costo por año. Usar para tendencias históricas.",
        "input_schema": {
            "type": "object",
            "properties": {
                "cliente": {"type": "string", "description": "Nombre del cliente (puede ser parcial)."},
            },
            "required": ["cliente"],
        },
    },
    {
        "name": "get_detalle_mensual",
        "description": "Desglose mensual de facturación. Usar para estacionalidad, tendencias mes a mes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "cliente": {"type": "string",  "description": "Nombre del cliente (opcional, si se omite devuelve totales)."},
                "ano":     {"type": "integer", "description": "Año a consultar (opcional)."},
            },
        },
    },
    {
        "name": "get_dnit",
        "description": "Empresas del DNIT con ranking de mercado e ingreso estimado. Usar para análisis de mercado.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limite": {"type": "integer", "description": "Máximo de empresas (default: 50)."},
                "buscar": {"type": "string",  "description": "Nombre parcial de una empresa específica."},
            },
        },
    },
    {
        "name": "get_marketing",
        "description": "Perfil de madurez de marketing de Adlens: cluster, puntaje, dimensiones (cultura, ejecución, estructura, competitividad), inversión por medio, CRM, digital. Usar para análisis de madurez publicitaria.",
        "input_schema": {
            "type": "object",
            "properties": {
                "buscar": {"type": "string", "description": "Nombre parcial de un anunciante específico."},
            },
        },
    },
    {
        "name": "get_inversion_detalle",
        "description": "Detalle transaccional de inversión en medios: cada fila es un anunciante + medio + mes. Usar para comparar inversión por medio (TV vs radio vs digital), tendencias mensuales o análisis por agencia.",
        "input_schema": {
            "type": "object",
            "properties": {
                "buscar": {"type": "string",  "description": "Nombre parcial de un anunciante específico."},
                "medio":  {"type": "string",  "description": "Filtrar por medio (ej: 'TV', 'RADIO', 'DIGITAL')."},
                "ano":    {"type": "integer", "description": "Filtrar por año."},
            },
        },
    },
    {
        "name": "cruzar_cliente",
        "description": "Perfil completo de un cliente cruzando ERP + DNIT + Marketing. Usar cuando se necesita el perfil integral de un cliente.",
        "input_schema": {
            "type": "object",
            "properties": {
                "cliente": {"type": "string", "description": "Nombre del cliente (puede ser parcial)."},
            },
            "required": ["cliente"],
        },
    },
    {
        "name": "get_oportunidades",
        "description": "Empresas del DNIT que NO son clientes del ERP, ordenadas por ranking. Usar para identificar oportunidades de captación.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limite": {"type": "integer", "description": "Máximo de oportunidades (default: 20)."},
            },
        },
    },
    {
        "name": "generar_grafico",
        "description": "Genera un gráfico Plotly a partir de datos estructurados. Usar SIEMPRE que el usuario pida un gráfico, diagrama o visualización. Python construye el JSON correctamente — nunca escribir JSON de Plotly manualmente.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tipo": {
                    "type": "string",
                    "enum": ["bar", "line", "pie", "scatter"],
                    "description": "Tipo de gráfico: bar (barras), line (líneas), pie (torta), scatter (dispersión).",
                },
                "titulo": {
                    "type": "string",
                    "description": "Título del gráfico.",
                },
                "series": {
                    "type": "array",
                    "description": "Lista de series de datos. Cada serie tiene nombre, x (etiquetas) e y (valores numéricos).",
                    "items": {
                        "type": "object",
                        "properties": {
                            "nombre": {"type": "string", "description": "Nombre de la serie (ej: 'Facturación 2024')."},
                            "x": {"type": "array", "description": "Etiquetas del eje X (ej: nombres de clientes, meses, años)."},
                            "y": {"type": "array", "description": "Valores numéricos del eje Y."},
                        },
                        "required": ["nombre", "x", "y"],
                    },
                },
                "eje_x": {"type": "string", "description": "Etiqueta del eje X (opcional)."},
                "eje_y": {"type": "string", "description": "Etiqueta del eje Y (opcional)."},
            },
            "required": ["tipo", "titulo", "series"],
        },
    },
]


# ── Extracción de gráfico Plotly ──────────────────────────────────────────────

def _limpiar_json_grafico(json_str: str) -> str:
    json_str = json_str.strip()
    abre_llaves = json_str.count("{")
    cierra_llaves = json_str.count("}")
    abre_corchetes = json_str.count("[")
    cierra_corchetes = json_str.count("]")
    while cierra_llaves > abre_llaves and json_str.endswith("}"):
        json_str = json_str[:-1]
        cierra_llaves -= 1
    while cierra_corchetes > abre_corchetes and json_str.endswith("]"):
        json_str = json_str[:-1]
        cierra_corchetes -= 1
    return json_str.strip()


def _extraer_grafico(texto: str) -> tuple[str, dict | None]:
    patron = r"<<<PLOTLY_START>>>(.*?)<<<PLOTLY_END>>>"
    match = re.search(patron, texto, re.DOTALL)
    if not match:
        return texto, None

    json_str = _limpiar_json_grafico(match.group(1).strip())
    texto_limpio = texto[: match.start()].strip() + texto[match.end() :].strip()

    try:
        grafico = json.loads(json_str)
        for trace in grafico.get("data", []):
            if "y" in trace:
                trace["y"] = [v if v is not None else 0 for v in trace["y"]]
            if "x" in trace:
                trace["x"] = [v if v is not None else "" for v in trace["x"]]

        if "layout" in grafico:
            for trace in grafico.get("data", []):
                x_vals = trace.get("x", [])
                if x_vals and all(
                    str(v).strip() in [str(y) for y in range(2000, 2031)]
                    for v in x_vals
                ):
                    grafico["layout"]["xaxis"] = {
                        **grafico["layout"].get("xaxis", {}),
                        "type": "category",
                        "tickvals": [str(v) for v in x_vals],
                        "ticktext": [str(int(float(v))) for v in x_vals],
                    }
                    trace["x"] = [str(int(float(v))) for v in x_vals]
                    break

            yaxis = grafico["layout"].get("yaxis", {})
            for trace in grafico.get("data", []):
                y_vals = [v for v in trace.get("y", []) if isinstance(v, (int, float))]
                if y_vals and max(y_vals) > 1_000_000:
                    grafico["layout"]["yaxis"] = {
                        **yaxis,
                        "tickformat": ",.0f",
                        "exponentformat": "none",
                    }
                    break

        return texto_limpio, grafico
    except json.JSONDecodeError:
        return texto, None


# ── Claude API con Tool Use ───────────────────────────────────────────────────

def _llamar_claude(
    messages: list[dict],
    system_prompt: str,
    tools: list[dict],
    max_tokens: int = 4096,
) -> dict:
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY no configurada en .env")

    try:
        response = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "anthropic-beta": "prompt-caching-2024-07-31",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-6",
                "max_tokens": max_tokens,
                "system": [
                    {
                        "type": "text",
                        "text": system_prompt,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                "tools": tools,
                "messages": messages,
            },
            timeout=120.0,
        )
        response.raise_for_status()
        return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=503, detail="Timeout al conectar con Claude API")
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Error Claude API: {e.response.status_code} - {e.response.text[:200]}",
        )


def _llamar_mistral(messages: list[dict]) -> str:
    api_key = os.getenv("MISTRAL_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="MISTRAL_API_KEY no configurada en .env")
    try:
        response = httpx.post(
            "https://api.mistral.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"model": "mistral-small-latest", "messages": messages},
            timeout=60.0,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error Mistral: {str(e)[:200]}")


# ── Loop de Tool Use ──────────────────────────────────────────────────────────

MAX_RONDAS = 8


def _ejecutar_loop_tools(
    db: Session,
    sesion_id: int,
    messages: list[dict],
    system_prompt: str,
) -> tuple[str, dict | None]:
    grafico_json: dict | None = None

    for _ in range(MAX_RONDAS):
        data = _llamar_claude(messages, system_prompt, HERRAMIENTAS)
        stop_reason = data.get("stop_reason")
        content = data.get("content", [])

        if stop_reason == "end_turn":
            texto = "".join(
                bloque["text"] for bloque in content if bloque.get("type") == "text"
            )
            return texto, grafico_json

        if stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": content})

            tool_results = []
            for bloque in content:
                if bloque.get("type") == "tool_use":
                    resultado = ejecutar_herramienta(
                        db, sesion_id, bloque["name"], bloque.get("input", {})
                    )

                    if bloque["name"] == "generar_grafico" and "grafico_json" in resultado:
                        grafico_json = resultado["grafico_json"]
                        confirmacion = {"status": "grafico_generado", "titulo": resultado.get("titulo")}
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": bloque["id"],
                            "content": json.dumps(confirmacion, ensure_ascii=False),
                        })
                    else:
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": bloque["id"],
                            "content": json.dumps(resultado, ensure_ascii=False, default=str),
                        })

            messages.append({"role": "user", "content": tool_results})
        else:
            break

    return "No pude generar una respuesta. Intentá reformular la pregunta.", grafico_json


# ── Función principal ─────────────────────────────────────────────────────────

def procesar_mensaje(
    db: Session,
    conversacion_id: int,
    usuario_id: int,
    pregunta: str,
) -> dict:
    _verificar_rate_limit(usuario_id)

    conv = db.query(Conversacion).filter(
        Conversacion.id == conversacion_id,
        Conversacion.usuario_id == usuario_id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")

    system_prompt = _cargar_system_prompt()

    historial = (
        db.query(Mensaje)
        .filter(Mensaje.conversacion_id == conversacion_id)
        .order_by(Mensaje.created_at.desc())
        .limit(6)
        .all()
    )

    messages = []
    for msg in reversed(historial):
        messages.append({"role": msg.rol, "content": msg.contenido})
    messages.append({"role": "user", "content": pregunta})

    gaps = _detectar_gaps(pregunta)
    if gaps:
        system_prompt += (
            "\n\n═══════════════════════════════════════════════"
            "\nALERTA DE GAPS PARA ESTA PREGUNTA"
            "\n═══════════════════════════════════════════════"
            "\nEl usuario está pidiendo datos que NO están en el sistema:"
            "\n- " + "\n- ".join(gaps) +
            "\nRespondé con lo que SÍ tenés y explicá claramente qué falta "
            "en lenguaje de negocio, sin tecnicismos."
        )

    modelo = os.getenv("ACTIVE_AI_MODEL", "claude").lower()

    if modelo == "mistral":
        messages_mistral = [{"role": "system", "content": system_prompt}] + messages
        respuesta_raw = _llamar_mistral(messages_mistral)
        respuesta_texto, grafico_json = _extraer_grafico(respuesta_raw)
    else:
        respuesta_texto, grafico_json = _ejecutar_loop_tools(db, conv.sesion_id, messages, system_prompt)

    db.add(Mensaje(
        conversacion_id=conversacion_id,
        rol="user",
        contenido=pregunta,
        grafico_json=None,
    ))
    db.add(Mensaje(
        conversacion_id=conversacion_id,
        rol="assistant",
        contenido=respuesta_texto,
        grafico_json=grafico_json,
    ))
    db.commit()

    return {"respuesta": respuesta_texto, "grafico_json": grafico_json}
