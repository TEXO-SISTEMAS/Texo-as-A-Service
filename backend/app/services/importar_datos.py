"""
Importa datos de archivos Excel a las tablas datos_erp, datos_dnit, datos_marketing.
Se llama al subir un archivo, reemplazando los datos anteriores de esa fuente.
"""

import re
import pandas as pd
from sqlalchemy.orm import Session

from app.models.archivo_subido import ArchivoSubido
from app.models.datos_erp import DatoERP
from app.models.datos_dnit import DatoDNIT
from app.models.datos_adlens_base import DatoAdlensBase
from app.models.datos_inversion_medios import DatoInversionMedios


ESTADOS_VALIDOS_ERP = {"FACTURADO", "FACTURA", "FACTURADO ", "FACTURA ",
                        "Facturado ", "Facturado", "fACTURA", "FACTURAS"}


def importar_excel(db: Session, archivo: ArchivoSubido) -> None:
    """Punto de entrada: delega al importador según fuente_tipo."""
    fuente = archivo.fuente_tipo.lower()
    if fuente == "erp":
        _importar_erp(db, archivo)
    elif fuente == "dnit":
        _importar_dnit(db, archivo)
    elif fuente == "adlens_base":
        _importar_adlens_base(db, archivo)
    elif fuente == "inversion_en_medios":
        _importar_inversion_medios(db, archivo)


# ---------------------------------------------------------------------------
# ERP
# ---------------------------------------------------------------------------

def _importar_erp(db: Session, archivo: ArchivoSubido) -> None:
    db.query(DatoERP).filter(DatoERP.sesion_id == archivo.sesion_id).delete()

    try:
        df = pd.read_excel(archivo.path_local)
    except Exception:
        return

    if "ESTADO" in df.columns:
        df = df[df["ESTADO"].isin(ESTADOS_VALIDOS_ERP)].copy()

    if "FECHA DE FACT." in df.columns:
        df["FECHA DE FACT."] = pd.to_datetime(df["FECHA DE FACT."], errors="coerce")
        df["_ano"] = df["FECHA DE FACT."].dt.year
    else:
        df["_ano"] = None

    registros = []
    for _, row in df.iterrows():
        registros.append(DatoERP(
            sesion_id=archivo.sesion_id,
            archivo_id=archivo.id,
            cliente=str(row.get("CLIENTE", "")).strip(),
            empresa=str(row["EMPRESA"]).strip() if "EMPRESA" in df.columns and pd.notna(row.get("EMPRESA")) else None,
            estado=str(row.get("ESTADO", "")).strip() if pd.notna(row.get("ESTADO")) else None,
            facturacion=_float(row.get("FACTURACION")),
            costo=_float(row.get("COSTO")),
            revenue=_float(row.get("REVENUE")),
            fecha_factura=row["FECHA DE FACT."].date() if "FECHA DE FACT." in df.columns and pd.notna(row.get("FECHA DE FACT.")) else None,
            ano=int(row["_ano"]) if pd.notna(row.get("_ano")) else None,
        ))

    db.bulk_save_objects(registros)
    db.commit()


# ---------------------------------------------------------------------------
# DNIT
# ---------------------------------------------------------------------------

def _importar_dnit(db: Session, archivo: ArchivoSubido) -> None:
    db.query(DatoDNIT).filter(DatoDNIT.sesion_id == archivo.sesion_id).delete()

    try:
        df = pd.read_excel(archivo.path_local)
    except Exception:
        return

    col_empresa = next((c for c in df.columns if "razon" in c.lower() or "nombre" in c.lower()), None)
    col_ruc     = next((c for c in df.columns if c.strip().upper() == "RUC"), None)
    col_ranking = next((c for c in df.columns if "ranking" in c.lower()), None)
    col_aporte  = next((c for c in df.columns if "aporte" in c.lower()), None)
    col_ingreso = next((c for c in df.columns if "ingreso" in c.lower() and "estimado" in c.lower()), None)

    if not col_empresa:
        return

    registros = []
    for _, row in df.iterrows():
        nombre = str(row[col_empresa]).strip() if pd.notna(row.get(col_empresa)) else None
        if not nombre:
            continue
        ruc_val = str(row[col_ruc]).strip() if col_ruc and pd.notna(row.get(col_ruc)) else None
        registros.append(DatoDNIT(
            sesion_id=archivo.sesion_id,
            archivo_id=archivo.id,
            nombre_empresa=nombre,
            ruc=ruc_val,
            razon_social=nombre,
            ranking=int(row[col_ranking]) if col_ranking and pd.notna(row.get(col_ranking)) else None,
            aporte_gs=_float(row.get(col_aporte)) if col_aporte else None,
            ingreso_estimado_gs=_float(row.get(col_ingreso)) if col_ingreso else None,
        ))

    db.bulk_save_objects(registros)
    db.commit()


# ---------------------------------------------------------------------------
# Adlens Base
# ---------------------------------------------------------------------------

# Mapeo: nombre de columna en Excel -> campo del modelo
_ADLENS_BASE_COLS = {
    "anunciante":                    "anunciante",
    "rubro principal":               "rubro_principal",
    "central de medios":             "central_de_medios",
    "nombre del gerente de marketing": "nombre_gerente_marketing",
    "nombre del dueño":              "nombre_dueno",
    "sitio web":                     "sitio_web",
    "¿qué tipo de empresa es?":      "tipo_empresa",
    "tamaño de la empresa.\ncantidad de empleados:": "tamano_empresa",
    "¿tiene la empresa un departamento de compras?": "tiene_depto_compras",
    "¿tiene la empresa departamento de marketing?":  "tiene_depto_marketing",
    "¿el departamento de marketing tiene un presupuesto anual definido?": "tiene_presupuesto_anual",
    "la empresa realiza sus proyectos de comunicación de marketing de manera:": "modalidad_proyectos",
    "¿el departamento de marketing toma decisiones autónomas sobre las compras?": "decisiones_autonomas",
    "las decisiones de marketing se toman con la aprobación de:": "aprobacion_decisiones",
    "¿quién es el punto de contacto para servicios de comunicaciones de marketing externos?": "contacto_externo",
    "la empresa es:":                "tipo_marca",
    "sus marcas son:":               "marcas",
    "¿en que estadio del brand funnel está la marca?": "estadio_brand_funnel",
    "¿qué % de market share tiene la marca?":          "market_share",
    "la empresa, ¿invierte en investigación, estrategia o servicios de consultoría?": "invierte_investigacion",
    "¿en qué medios invierte la empresa principalmente?": "medios_principales",
    "afinidad de la empresa con servicios de comunicaciones de marketing": "afinidad_servicios",
    "la marca/empresa, ¿busca innovación a través acciones de marketing y  publicidad?": "busca_innovacion",
    "con respecto al marketing y la publicidad es una empresa:": "perfil_empresa",
    "la empresa, ¿trabaja en construcción de marcas?":  "trabaja_construccion_marca",
    "su empresa tiene desarrollada una cultura organizacional": "tiene_cultura_org",
    "su empresa tiene un programa de rse (responsabilidad social empresarial)": "tiene_rse",
    "estos programas culturales o de rse están alineados al propósito de marca": "rse_alineado_marca",
    "en la empresa, ¿quién es el interlocutor para cuestiones sobre comunicación, innovación, desarrollos tecnológicos y/o oportunidades en el universo digital?": "interlocutor_digital",
    "la empresa, ¿invierte en marketing digital?": "invierte_marketing_digital",
    "como la pandemia impacto en la transformación digital de tu empresa": "impacto_pandemia_digital",
    "la empresa cuenta con un departamento/encargado de marketing digital": "tiene_depto_digital",
    "si la empresa invierte en digital, ¿tiene una estrategia digital definida?": "tiene_estrategia_digital",
    "¿si la empresa invierte en pauta digital, con que foco lo hacen?": "foco_pauta_digital",
    "cual es la principal plataforma digital que utiliza su empresa dentro de su estrategia de marketing": "plataforma_digital_principal",
    "la empresa almacena y trabaja con datos de sus clientes": "trabaja_datos_clientes",
    "la empresa tiene un:":          "tipo_sistema",
    "la empresa tiene un crm":       "tiene_crm",
    "el crm está integrado a sus plataformas digitales": "crm_integrado",
    "¿la empresa tiene un programa de fidelidad para sus clientes?": "tiene_programa_fidelidad",
    "cual fue la última acción/proyecto de innovación que desarrollo la empresa": "ultima_innovacion",
    "¿de cuántas personas está constituida la estructura de marketing de la empresa?": "tamano_equipo_marketing",
    "la empresa, ¿invierte en research?": "invierte_research",
    "la empresa, ¿invierte en pdv?":  "invierte_pdv",
    "¿qué tan desconfiada es la empresa? (cuánto cuesta venderle la idea)": "nivel_desconfianza",
    "inversión en tv abierta 2024 (en miles usd)":  "inv_tv_abierta_usd",
    "inversión en radio 2024 (en miles usd.)":      "inv_radio_usd",
    "inversión en cable 2024 (en miles usd.)":      "inv_cable_usd",
    "inversión en revistas 2024 (en miles usd.)":   "inv_revistas_usd",
    "inversión en diarios 2024 (en miles usd.)":    "inv_diarios_usd",
    "rango de inversión ":           "rango_inversion",
    "inversión en pdv 2024 (en miles }usd.)":       "inv_pdv_usd",
    "con respecto al marketing y la publicidad es una empresa (discreta, muy consevadora o valiente)": "score_perfil_empresa",
    "la empresa, ¿trabaja en construcción de marcas? (0: nada - 5: mucho)": "score_construccion_marca",
    "como se proyecta la empresa\n¿corto, mediano o largo plazo?\n1: corto\n2: mediano\n3: largo": "score_horizonte_plazo",
    "¿qué tan importante es la estrategia de tu marca?\n1: poco\n2: más o menos\n3: mucho": "score_importancia_estrategia",
    "¿el departamento de marketing tiene un presupuesto anual definido?.1": "score_presupuesto_anual",
    "¿el departamento de marketing toma decisiones autónomas sobre las compras? .1": "score_decisiones_autonomas",
    "¿qué tan importante es el diseño y la creatividad?\n1: poco\n2: más o menos\n3: mucho": "score_importancia_diseno",
    "la marca/empresa, ¿se destaca por innovar en publicidad? (0: nada - 5: mucho)": "score_innovacion_publicidad",
    "¿qué tan desconfiada es la empresa? (cuánto cuesta venderle la idea).1": "score_desconfianza",
    "afinidad de la empresa con servicios de comunicaciones de marketing .1": "score_afinidad_servicios",
    "¿tiene la empresa un departamento de compras?  .1": "score_depto_compras",
    "¿tiene la empresa área de marketing?":          "score_area_marketing",
    "¿de cuántas personas está constituida la estructura de marketing de la empresa?.1": "score_tamano_equipo",
    "tamaño de la empresa.\ncantidad de empleados:.1": "score_tamano_empresa",
    "la empresa cuenta con un departamento/encargado de marketing digital.1": "score_depto_digital",
    "su marcas son:":                "score_marcas",
    "¿en qué estadio del brand funnel se encuentra la marca?": "score_brand_funnel",
    "¿qué porcentaje de market share tiene la marca?": "score_market_share",
    "la empresa, ¿invierte en digital?": "score_invierte_digital",
    "la empresa, ¿invierte en research? .1": "score_invierte_research",
    "la empresa, ¿invierte en pdv?.1": "score_invierte_pdv",
    "la empresa, ¿invierte en investigación, estrategia o servicios de consultoría? .1": "score_invierte_investigacion",
    "inversión en medios":           "inversion_en_medios",
    "puntaje total":                 "puntaje_total",
    "cluster":                       "cluster",
    "tipo de cluster":               "tipo_cluster",
    "cultura":                       "cultura",
    "ejecución":                     "ejecucion",
    "estructura":                    "estructura",
    "competitividad":                "competitividad",
    "inversión":                     "inversion",
    "z_cultura":                     "z_cultura",
    "z_ejecución":                   "z_ejecucion",
    "z_estructura":                  "z_estructura",
    "z_competitividad":              "z_competitividad",
    "z_inversión":                   "z_inversion",
    "fórmula_pc1":                   "formula_pc1",
    "fórmula_pc2":                   "formula_pc2",
}


def _importar_adlens_base(db: Session, archivo: ArchivoSubido) -> None:
    db.query(DatoAdlensBase).filter(DatoAdlensBase.sesion_id == archivo.sesion_id).delete()

    try:
        df = pd.read_excel(archivo.path_local)
    except Exception:
        return

    # Normalizar nombres de columna para el lookup
    col_map = {str(c).strip().lower(): c for c in df.columns}

    registros = []
    for _, row in df.iterrows():
        anunciante = str(row.get("anunciante", "")).strip()
        if not anunciante or anunciante == "nan":
            continue

        kwargs = {"sesion_id": archivo.sesion_id, "archivo_id": archivo.id}
        for col_excel, campo_modelo in _ADLENS_BASE_COLS.items():
            col_real = col_map.get(col_excel.lower())
            if col_real is None:
                continue
            val = row.get(col_real)
            if campo_modelo in ("anunciante",) or campo_modelo.startswith("score_") or \
               campo_modelo in ("puntaje_total", "cluster", "tipo_cluster", "cultura",
                                "ejecucion", "estructura", "competitividad", "inversion",
                                "z_cultura", "z_ejecucion", "z_estructura", "z_competitividad",
                                "z_inversion", "formula_pc1", "formula_pc2",
                                "inv_tv_abierta_usd", "inv_radio_usd", "inv_cable_usd",
                                "inv_revistas_usd", "inv_diarios_usd", "inv_pdv_usd",
                                "rango_inversion", "inversion_en_medios"):
                kwargs[campo_modelo] = _float(val)
            else:
                kwargs[campo_modelo] = _str(val)

        registros.append(DatoAdlensBase(**kwargs))

    db.bulk_save_objects(registros)
    db.commit()


# ---------------------------------------------------------------------------
# Inversión en Medios
# ---------------------------------------------------------------------------

def _importar_inversion_medios(db: Session, archivo: ArchivoSubido) -> None:
    db.query(DatoInversionMedios).filter(DatoInversionMedios.sesion_id == archivo.sesion_id).delete()

    try:
        df = pd.read_excel(archivo.path_local, sheet_name="2024")
    except Exception:
        return

    col_map = {str(c).strip().lower(): c for c in df.columns}

    def _get(col_lower):
        return col_map.get(col_lower)

    col_anunciante = _get("anunciante")
    if not col_anunciante:
        return

    col_gs  = next((col_map[k] for k in col_map if "(gs)" in k), None)
    col_usd = next((col_map[k] for k in col_map if "(us$)" in k), None)
    col_desc = next((col_map[k] for k in col_map if "desc" in k and "%" in k.lower()), None)
    col_rango = next((col_map[k] for k in col_map if "rango" in k), None)

    registros = []
    for _, row in df.iterrows():
        anunciante = str(row.get(col_anunciante, "")).strip()
        if not anunciante or anunciante == "nan":
            continue
        registros.append(DatoInversionMedios(
            sesion_id=archivo.sesion_id,
            archivo_id=archivo.id,
            setor=_str(row.get(col_map.get("setor"))),
            categoria=_str(row.get(col_map.get("categoria"))),
            anunciante=anunciante,
            agencia=_str(row.get(col_map.get("agência") or col_map.get("agencia"))),
            medio=_str(row.get(col_map.get("medio"))),
            veiculo=_str(row.get(col_map.get("veículo") or col_map.get("veiculo"))),
            grupo_empresarial=_str(row.get(col_map.get("grupo empresarial"))),
            mes=_str(row.get(col_map.get("mes"))),
            ano=int(row[col_map["año"]]) if "año" in col_map and pd.notna(row.get(col_map["año"])) else None,
            monto_gs=_float(row.get(col_gs)) if col_gs else None,
            monto_usd=_float(row.get(col_usd)) if col_usd else None,
            descuento_pct=_float(row.get(col_desc)) if col_desc else None,
            rango_inversion=_float(row.get(col_rango)) if col_rango else None,
        ))

    db.bulk_save_objects(registros)
    db.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _float(val) -> float | None:
    if val is None or (hasattr(val, "__class__") and val.__class__.__name__ == "NAType"):
        return None
    try:
        import math
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def _str(val) -> str | None:
    if val is None or (hasattr(val, "__class__") and val.__class__.__name__ == "NAType"):
        return None
    s = str(val).strip()
    return None if s == "nan" else s
