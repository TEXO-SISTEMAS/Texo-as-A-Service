from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
import pandas as pd
import re
from rapidfuzz import process, fuzz

from app.utils.database import get_db
from app.utils.dependencies import get_current_user
from app.models.usuario import Usuario
from app.models.archivo_subido import ArchivoSubido
from app.models.match_cruzado import MatchCruzado
from app.models.datos_erp import DatoERP
from app.models.datos_dnit import DatoDNIT
from app.models.datos_marketing import DatoMarketing

router = APIRouter()


@router.get("/sesion/{sesion_id}")
def get_dashboard(
    sesion_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Obtiene datos para el dashboard de una sesión.
    Requiere autenticación.
    """
    # 1. Leer archivos de la sesión
    archivos = (
        db.query(ArchivoSubido)
        .filter(ArchivoSubido.sesion_id == sesion_id)
        .all()
    )

    archivo_erp = next((a for a in archivos if a.fuente_tipo == "erp"), None)
    archivo_dnit = next((a for a in archivos if a.fuente_tipo == "dnit"), None)
    archivo_marketing_base = next(
        (a for a in archivos if a.fuente_tipo == "adlens_base"), None
    )
    archivo_marketing_medios = next(
        (a for a in archivos if a.fuente_tipo == "inversion_en_medios"), None
    )

    # 2. Cargar DataFrames desde PostgreSQL
    erp_df = None
    if archivo_erp:
        filas = db.query(DatoERP).filter(DatoERP.sesion_id == sesion_id).all()
        if filas:
            erp_df = pd.DataFrame([{
                "CLIENTE": r.cliente,
                "EMPRESA": r.empresa,
                "ESTADO": r.estado,
                "FACTURACION": r.facturacion,
                "COSTO": r.costo,
                "REVENUE": r.revenue,
                "AÑO": r.ano,
            } for r in filas])

    dnit_df = None
    if archivo_dnit:
        filas = db.query(DatoDNIT).filter(DatoDNIT.sesion_id == sesion_id).all()
        if filas:
            dnit_df = pd.DataFrame([{
                "nombre_empresa": r.nombre_empresa,
                "ranking": r.ranking,
                "ingreso_estimado_gs": r.ingreso_estimado_gs,
            } for r in filas])

    marketing_df = None
    if archivo_marketing_base or archivo_marketing_medios:
        filas = db.query(DatoMarketing).filter(DatoMarketing.sesion_id == sesion_id).all()
        if filas:
            marketing_df = pd.DataFrame([{
                "anunciante": r.anunciante,
                "tipodecluster": r.tipodecluster,
                "puntajetotal": r.puntajetotal,
                "inv_total_gs": r.inv_total_gs,
                "inv_total_usd": r.inv_total_usd,
            } for r in filas])

    # 3. Leer matches confirmados
    matches_confirmados = (
        db.query(MatchCruzado)
        .filter(
            and_(
                MatchCruzado.sesion_id == sesion_id,
                MatchCruzado.estado.in_(["auto_confirmado", "corregido"]),
            )
        )
        .all()
    )

    # Construir respuesta
    result = {
        "erp": _procesar_erp(erp_df),
        "dnit": _procesar_dnit(dnit_df, erp_df, matches_confirmados),
        "marketing": _procesar_marketing(marketing_df, erp_df, matches_confirmados),
        "analisis": _procesar_analisis(erp_df),
        "salud_ejecutiva": _procesar_salud_ejecutiva(erp_df),
    }

    return result


def _procesar_erp(erp_df: pd.DataFrame | None) -> dict:
    """Procesa datos del ERP."""
    if erp_df is None or erp_df.empty:
        return {
            "facturacion_total_gs": 0,
            "revenue_total_gs": 0,
            "anos_disponibles": [],
            "clientes_por_ano": {},
            "top10_clientes": [],
            "por_empresa": [],
            "evolucion_top5": {},
        }

    # Asegurar columnas numéricas
    for col in ["FACTURACION", "REVENUE", "COSTO"]:
        if col in erp_df.columns:
            erp_df[col] = pd.to_numeric(erp_df[col], errors="coerce").fillna(0)

    # Facturación y revenue total
    facturacion_total = float(erp_df["FACTURACION"].sum()) if "FACTURACION" in erp_df.columns else 0
    revenue_total = float(erp_df["REVENUE"].sum()) if "REVENUE" in erp_df.columns else 0

    # Años disponibles
    if "AÑO" in erp_df.columns:
        anos_disponibles = sorted(erp_df["AÑO"].dropna().unique().tolist())
        # Convertir a int si son floats
        anos_disponibles = [int(a) for a in anos_disponibles if pd.notna(a)]
    else:
        anos_disponibles = []

    # Clientes por año
    if "AÑO" in erp_df.columns and "CLIENTE" in erp_df.columns:
        clientes_por_ano = (
            erp_df.groupby("AÑO")["CLIENTE"]
            .nunique()
            .to_dict()
        )
        # Convertir keys a int
        clientes_por_ano = {int(k): int(v) for k, v in clientes_por_ano.items() if pd.notna(k)}
    else:
        clientes_por_ano = {}

    # Top 10 clientes por facturación
    if "CLIENTE" in erp_df.columns and "FACTURACION" in erp_df.columns:
        top10_df = (
            erp_df.groupby("CLIENTE", as_index=False)
            .agg({
                "FACTURACION": "sum",
                "REVENUE": "sum" if "REVENUE" in erp_df.columns else lambda x: 0,
                "COSTO": "sum" if "COSTO" in erp_df.columns else lambda x: 0,
            })
            .nlargest(10, "FACTURACION")
        )
        top10_clientes = [
            {
                "CLIENTE": row["CLIENTE"],
                "FACTURACION": float(row["FACTURACION"]),
                "REVENUE": float(row["REVENUE"]) if "REVENUE" in row else 0,
                "COSTO": float(row["COSTO"]) if "COSTO" in row else 0,
            }
            for _, row in top10_df.iterrows()
        ]
    else:
        top10_clientes = []

    # Por empresa
    if "EMPRESA" in erp_df.columns:
        por_empresa_df = (
            erp_df.groupby("EMPRESA", as_index=False)
            .agg({
                "FACTURACION": "sum",
                "REVENUE": "sum" if "REVENUE" in erp_df.columns else lambda x: 0,
            })
        )
        por_empresa = [
            {
                "empresa": row["EMPRESA"],
                "facturacion": float(row["FACTURACION"]),
                "revenue": float(row["REVENUE"]) if "REVENUE" in row else 0,
            }
            for _, row in por_empresa_df.iterrows()
        ]
    else:
        por_empresa = []

    # Evolución top 5 clientes históricos
    if "CLIENTE" in erp_df.columns and "AÑO" in erp_df.columns and "FACTURACION" in erp_df.columns:
        # Top 5 clientes por facturación total histórica
        top5_clientes = (
            erp_df.groupby("CLIENTE", as_index=False)["FACTURACION"]
            .sum()
            .nlargest(5, "FACTURACION")["CLIENTE"]
            .tolist()
        )

        evolucion_top5 = {}
        for cliente in top5_clientes:
            cliente_df = erp_df[erp_df["CLIENTE"] == cliente]
            evolucion = {}
            for _, grupo in cliente_df.groupby("AÑO"):
                ano = int(grupo["AÑO"].iloc[0]) if pd.notna(grupo["AÑO"].iloc[0]) else None
                if ano:
                    evolucion[str(ano)] = {
                        "facturacion_gs": float(grupo["FACTURACION"].sum()),
                        "revenue_gs": float(grupo["REVENUE"].sum()) if "REVENUE" in cliente_df.columns else 0,
                    }
            evolucion_top5[cliente] = evolucion
    else:
        evolucion_top5 = {}

    return {
        "facturacion_total_gs": facturacion_total,
        "revenue_total_gs": revenue_total,
        "anos_disponibles": anos_disponibles,
        "clientes_por_ano": clientes_por_ano,
        "top10_clientes": top10_clientes,
        "por_empresa": por_empresa,
        "evolucion_top5": evolucion_top5,
    }


def _norm(name):
    """Normaliza nombre para matching: uppercase, quita sufijos y caracteres especiales."""
    if not name:
        return ''
    name = str(name).upper()
    name = re.sub(r'\b(SA|SRL|LTDA|S\.A\.|S\.R\.L\.|SACI|SAECA)\b', '', name)
    name = re.sub(r'[^\w\s]', ' ', name)
    return re.sub(r'\s+', ' ', name).strip()


def _procesar_dnit(
    dnit_df: pd.DataFrame | None,
    erp_df: pd.DataFrame | None,
    matches: list[MatchCruzado],
) -> dict:
    """Procesa datos del DNIT usando fuzzy matching directo."""
    if dnit_df is None or dnit_df.empty:
        return {
            "total_en_ranking": 0,
            "top10_no_clientes": [],
            "clientes_con_dnit": [],
        }

    # Normalizar columnas del DNIT
    dnit_df = dnit_df.copy()
    dnit_df.columns = dnit_df.columns.str.strip().str.lower()

    # Identificar columnas del DNIT
    dnit_col_empresa = next(
        (c for c in dnit_df.columns if "razon" in c.lower() or "nombre" in c.lower()), None
    )
    dnit_col_ranking = next(
        (c for c in dnit_df.columns if "ranking" in c.lower()), None
    )
    dnit_col_ingreso = next(
        (c for c in dnit_df.columns if "ingreso" in c.lower()), None
    )

    if not dnit_col_empresa:
        return {
            "total_en_ranking": 0,
            "top10_no_clientes": [],
            "clientes_con_dnit": [],
        }

    clientes_con_dnit = []
    clientes_dnit_matched = set()

    if erp_df is not None and "CLIENTE" in erp_df.columns:
        # Crear mapping de nombre normalizado -> nombre original en DNIT
        dnit_norm_map = {
            _norm(c): c
            for c in dnit_df[dnit_col_empresa].dropna().tolist()
        }

        # Agrupar facturación por cliente ERP
        erp_por_cliente = erp_df.groupby("CLIENTE").agg(
            FACTURACION=("FACTURACION", "sum"),
            REVENUE=("REVENUE", "sum"),
        ).reset_index()

        # Fuzzy matching para cada cliente ERP
        for _, row in erp_por_cliente.iterrows():
            cliente = row["CLIENTE"]
            resultado = process.extractOne(
                _norm(cliente),
                dnit_norm_map.keys(),
                scorer=fuzz.token_sort_ratio,
                score_cutoff=75
            )
            if resultado:
                dnit_original = dnit_norm_map[resultado[0]]
                fila_dnit = dnit_df[dnit_df[dnit_col_empresa] == dnit_original]
                if not fila_dnit.empty:
                    clientes_con_dnit.append({
                        "cliente_erp": cliente,
                        "nombre_dnit": dnit_original,
                        "ranking_dnit": int(fila_dnit.iloc[0][dnit_col_ranking]) if dnit_col_ranking else None,
                        "facturacion_gs": int(row["FACTURACION"]),
                        "ingreso_estimado_gs": int(fila_dnit.iloc[0][dnit_col_ingreso]) if dnit_col_ingreso else None,
                    })
                    clientes_dnit_matched.add(dnit_original)

        # Ordenar por ranking
        clientes_con_dnit.sort(key=lambda x: x["ranking_dnit"] or 9999)

    # Top 10 no clientes (empresas del DNIT que no fueron matcheadas)
    dnit_df["_fue_matcheado"] = dnit_df[dnit_col_empresa].isin(clientes_dnit_matched)
    no_clientes = dnit_df[~dnit_df["_fue_matcheado"]].copy()

    if dnit_col_ranking:
        no_clientes["_ranking_num"] = pd.to_numeric(no_clientes[dnit_col_ranking], errors="coerce")
        no_clientes = no_clientes.dropna(subset=["_ranking_num"])
        no_clientes = no_clientes.sort_values("_ranking_num", ascending=True)

    top10_no_clientes = []
    for _, row in no_clientes.head(10).iterrows():
        top10_no_clientes.append({
            "ranking_dnit": int(row[dnit_col_ranking]) if dnit_col_ranking and pd.notna(row.get(dnit_col_ranking)) else None,
            "nombre": row[dnit_col_empresa],
            "ingreso_estimado_gs": float(row[dnit_col_ingreso]) if dnit_col_ingreso and pd.notna(row.get(dnit_col_ingreso)) else None,
        })

    return {
        "total_en_ranking": len(clientes_con_dnit),
        "top10_no_clientes": top10_no_clientes,
        "clientes_con_dnit": clientes_con_dnit,
    }


def _procesar_marketing(
    marketing_df: pd.DataFrame | None,
    erp_df: pd.DataFrame | None,
    matches: list[MatchCruzado],
) -> dict:
    """Procesa datos de Marketing."""
    if marketing_df is None or marketing_df.empty:
        return {
            "total_con_madurez": 0,
            "por_cluster": [],
            "top_inversion_medios": [],
        }

    # Normalizar columnas
    marketing_df = marketing_df.copy()
    marketing_df.columns = (
        marketing_df.columns
        .str.strip()
        .str.lower()
        .str.replace(" ", "", regex=False)
    )

    # Total con madurez (puntajetotal no nulo)
    col_puntaje = next(
        (c for c in marketing_df.columns if "puntajetotal" in c or "puntaje" in c), None
    )
    if col_puntaje:
        total_con_madurez = int(marketing_df[col_puntaje].notna().sum())
    else:
        total_con_madurez = 0

    # Por cluster
    col_cluster = next(
        (c for c in marketing_df.columns if "tipodecluster" in c or "cluster" in c), None
    )
    col_fact = next(
        (c for c in marketing_df.columns if "facturacion" in c or "venta" in c), None
    )
    if col_cluster:
        agg_dict = {"n_clientes": (col_cluster, "size")}
        if col_fact:
            agg_dict["facturacion_total"] = (col_fact, "sum")
        cluster_df = marketing_df.groupby(col_cluster, as_index=False).agg(**agg_dict)
        por_cluster = []
        for _, row in cluster_df.iterrows():
            item = {"tipodecluster": row[col_cluster], "n_clientes": int(row["n_clientes"])}
            if col_fact:
                item["facturacion_total"] = float(row["facturacion_total"]) if pd.notna(row["facturacion_total"]) else 0
            else:
                item["facturacion_total"] = 0
            por_cluster.append(item)
    else:
        por_cluster = []

    # Top inversión en medios - cruzar con ERP via matches confirmados
    col_inv = next(
        (c for c in marketing_df.columns if "inv_total" in c or "inversion" in c or "inversion_total" in c), None
    )
    col_anunciante = next(
        (c for c in marketing_df.columns if "anunciante" in c or "cliente" in c or "empresa" in c), None
    )

    top_inversion_medios = []
    if col_inv and col_anunciante and erp_df is not None and "CLIENTE" in erp_df.columns:
        # 1. Crear mapping de anunciante (marketing) -> cliente_erp via matches confirmados
        #    Solo matches con fuente3_nombre no nulo (Marketing tiene match con ERP)
        match_marketing_to_erp = {}
        for match in matches:
            if match.fuente3_nombre and match.fuente1_nombre:
                anunciante = str(match.fuente3_nombre).strip().lower()
                cliente_erp = str(match.fuente1_nombre).strip()
                match_marketing_to_erp[anunciante] = cliente_erp

        # 2. Agrupar inversión por anunciante desde marketing_df
        marketing_inv = marketing_df[[col_anunciante, col_inv]].copy()
        marketing_inv["_inv_num"] = pd.to_numeric(marketing_inv[col_inv], errors="coerce")
        marketing_inv = marketing_inv.dropna(subset=[col_anunciante, "_inv_num"])
        marketing_inv = marketing_inv.groupby(col_anunciante, as_index=False)["_inv_num"].sum()

        # 3. Calcular facturación total por cliente ERP
        erp_facturacion = erp_df.groupby("CLIENTE", as_index=False)["FACTURACION"].sum()

        # 4. Cruzar datos: solo incluir clientes con AMBOS datos disponibles
        resultados = []
        for _, row in marketing_inv.iterrows():
            anunciante = str(row[col_anunciante]).strip().lower()
            inv_total = float(row["_inv_num"])

            # Buscar cliente ERP correspondiente via match confirmado
            cliente_erp = match_marketing_to_erp.get(anunciante)

            if cliente_erp:
                # Buscar facturación de este cliente en ERP
                cliente_match = erp_facturacion[erp_facturacion["CLIENTE"] == cliente_erp]
                if not cliente_match.empty:
                    facturacion = float(cliente_match["FACTURACION"].iloc[0])
                    # Solo incluir si tiene facturación > 0 (AMBOS datos disponibles)
                    if facturacion > 0 and inv_total > 0:
                        resultados.append({
                            "cliente": cliente_erp,
                            "inv_total_gs": inv_total,
                            "facturacion_gs": facturacion,
                        })

        # 5. Ordenar por inversión y tomar top 10
        resultados.sort(key=lambda x: x["inv_total_gs"], reverse=True)
        top_inversion_medios = resultados[:10]

    return {
        "total_con_madurez": total_con_madurez,
        "por_cluster": por_cluster,
        "top_inversion_medios": top_inversion_medios,
    }


def _procesar_analisis(erp_df: pd.DataFrame | None) -> dict:
    """Procesa datos para análisis de rentabilidad y concentración."""
    if erp_df is None or erp_df.empty:
        return {
            "rentabilidad_arenas": [],
            "rentabilidad_subarenas": [],
            "rendimiento_inversion": [],
            "expertise_por_empresa": [],
            "concentracion_fee": [],
        }

    # Asegurar columnas numéricas
    for col in ["FACTURACION", "REVENUE", "COSTO"]:
        if col in erp_df.columns:
            erp_df[col] = pd.to_numeric(erp_df[col], errors="coerce").fillna(0)

    # 1. Rentabilidad por ARENA
    rentabilidad_arenas = []
    if "ARENA" in erp_df.columns:
        arenas_df = erp_df.groupby("ARENA", as_index=False).agg({
            "FACTURACION": "sum",
            "REVENUE": "sum",
            "COSTO": "sum" if "COSTO" in erp_df.columns else lambda x: 0,
        })
        for _, row in arenas_df.iterrows():
            facturacion = float(row["FACTURACION"])
            revenue = float(row["REVENUE"])
            margen_pct = (revenue / facturacion * 100) if facturacion > 0 else 0
            rentabilidad_arenas.append({
                "arena": row["ARENA"],
                "facturacion": facturacion,
                "revenue": revenue,
                "costo": float(row["COSTO"]) if "COSTO" in row else 0,
                "margen_pct": round(margen_pct, 2),
            })

    # 2. Rentabilidad por SUB-ARENAS (Top 10 por revenue)
    rentabilidad_subarenas = []
    if "SUB-ARENAS" in erp_df.columns:
        subarenas_df = erp_df.groupby("SUB-ARENAS", as_index=False).agg({
            "FACTURACION": "sum",
            "REVENUE": "sum",
            "COSTO": "sum" if "COSTO" in erp_df.columns else lambda x: 0,
        }).nlargest(10, "REVENUE")
        for _, row in subarenas_df.iterrows():
            facturacion = float(row["FACTURACION"])
            revenue = float(row["REVENUE"])
            margen_pct = (revenue / facturacion * 100) if facturacion > 0 else 0
            rentabilidad_subarenas.append({
                "subarena": row["SUB-ARENAS"],
                "facturacion": facturacion,
                "revenue": revenue,
                "costo": float(row["COSTO"]) if "COSTO" in row else 0,
                "margen_pct": round(margen_pct, 2),
            })

    # 3. Rendimiento de inversión por EMPRESA (ROI)
    rendimiento_inversion = []
    if "EMPRESA" in erp_df.columns:
        empresas_df = erp_df.groupby("EMPRESA", as_index=False).agg({
            "FACTURACION": "sum",
            "REVENUE": "sum",
        })
        for _, row in empresas_df.iterrows():
            facturacion = float(row["FACTURACION"])
            revenue = float(row["REVENUE"])
            roi = (revenue / facturacion * 100) if facturacion > 0 else 0
            rendimiento_inversion.append({
                "empresa": row["EMPRESA"],
                "facturacion": facturacion,
                "revenue": revenue,
                "roi": round(roi, 2),
            })
        # Ordenar por ROI descendente
        rendimiento_inversion.sort(key=lambda x: x["roi"], reverse=True)

    # 4. Expertise por EMPRESA y DIVISION
    expertise_por_empresa = []
    if "EMPRESA" in erp_df.columns and "DIVISION" in erp_df.columns:
        expertise_df = erp_df.groupby(["EMPRESA", "DIVISION"], as_index=False).agg({
            "REVENUE": "sum",
            "FACTURACION": "sum",
        })
        for _, row in expertise_df.iterrows():
            expertise_por_empresa.append({
                "empresa": row["EMPRESA"],
                "division": row["DIVISION"],
                "revenue": float(row["REVENUE"]),
                "facturacion": float(row["FACTURACION"]),
            })

    # 5. Concentración por FEE (DIVISION normalizada)
    concentracion_fee = []
    if "DIVISION" in erp_df.columns:
        # Normalizar nombres de DIVISION: unir "FEE VARIABLE " con "FEE VARIABLE", etc.
        erp_df = erp_df.copy()
        erp_df["_DIVISION_NORM"] = erp_df["DIVISION"].astype(str).str.strip()
        erp_df["_DIVISION_NORM"] = erp_df["_DIVISION_NORM"].str.replace(
            r"\s+", " ", regex=True
        )

        # Calcular revenue total global (excluyendo "SIN REVENUE")
        df_con_revenue = erp_df[~erp_df["_DIVISION_NORM"].str.upper().str.contains("SIN REVENUE", na=False)]
        revenue_global = df_con_revenue["REVENUE"].sum() if "REVENUE" in df_con_revenue.columns else 0

        # Agrupar por DIVISION normalizada
        fee_df = erp_df.groupby("_DIVISION_NORM", as_index=False).agg({
            "REVENUE": "sum",
        })

        for _, row in fee_df.iterrows():
            div_nombre = row["_DIVISION_NORM"]
            # Excluir "SIN REVENUE" del cálculo
            if "SIN REVENUE" in div_nombre.upper():
                continue
            revenue_total = float(row["REVENUE"])
            pct_del_total = (revenue_total / revenue_global * 100) if revenue_global > 0 else 0
            concentracion_fee.append({
                "division": div_nombre,
                "revenue_total": revenue_total,
                "pct_del_total": round(pct_del_total, 2),
            })

        # Ordenar por revenue_total descendente
        concentracion_fee.sort(key=lambda x: x["revenue_total"], reverse=True)

    return {
        "rentabilidad_arenas": rentabilidad_arenas,
        "rentabilidad_subarenas": rentabilidad_subarenas,
        "rendimiento_inversion": rendimiento_inversion,
        "expertise_por_empresa": expertise_por_empresa,
        "concentracion_fee": concentracion_fee,
    }


def _procesar_salud_ejecutiva(erp_df: pd.DataFrame | None) -> dict:
    """Vista ejecutiva: score grupal, estado por agencia, insights narrativos para CEO."""
    _empty = {
        "score_grupal": 0,
        "veredicto": "Sin datos cargados.",
        "agencias": [],
        "cuatro_preguntas": {
            "salud":       {"pregunta": "¿Estamos sanos como grupo?",          "respuesta": "—", "detalle": ""},
            "riesgo":      {"pregunta": "¿Quién depende demasiado de algo?",    "respuesta": "—", "detalle": ""},
            "potencial":   {"pregunta": "¿Quién tiene el mejor desempeño?",     "respuesta": "—", "detalle": ""},
            "intervencion":{"pregunta": "¿Qué necesita atención ahora?",        "respuesta": "—", "detalle": ""},
        },
        "insights": [],
    }

    if erp_df is None or erp_df.empty or "EMPRESA" not in erp_df.columns:
        return _empty

    erp_df = erp_df.copy()
    for col in ["FACTURACION", "REVENUE", "COSTO"]:
        if col in erp_df.columns:
            erp_df[col] = pd.to_numeric(erp_df[col], errors="coerce").fillna(0)

    # ── Por agencia ──────────────────────────────────────────────────────────
    agencias = []
    for empresa in [e for e in erp_df["EMPRESA"].dropna().unique() if str(e).strip()]:
        df_emp = erp_df[erp_df["EMPRESA"] == empresa]
        revenue     = float(df_emp["REVENUE"].sum())
        facturacion = float(df_emp["FACTURACION"].sum())
        margen_pct  = round((revenue / facturacion * 100), 1) if facturacion > 0 else 0.0

        cliente_top = ""
        concentracion_pct = 0.0
        if "CLIENTE" in df_emp.columns and revenue > 0:
            rev_por_cliente = df_emp.groupby("CLIENTE")["REVENUE"].sum()
            if len(rev_por_cliente) > 0:
                cliente_top       = str(rev_por_cliente.idxmax())
                concentracion_pct = round(float(rev_por_cliente.max()) / revenue * 100, 1)

        if concentracion_pct >= 50:
            nombre_corto = cliente_top[:25] + ("…" if len(cliente_top) > 25 else "")
            estado      = f"DEP. {nombre_corto}"
            estado_tipo = "dependencia"
        elif margen_pct < 5:
            estado      = "INTERVENIR"
            estado_tipo = "critico"
        elif margen_pct < 10:
            estado      = "BAJO MARGEN"
            estado_tipo = "alerta"
        else:
            estado      = "SANA"
            estado_tipo = "sana"

        agencias.append({
            "nombre": empresa,
            "revenue": revenue,
            "facturacion": facturacion,
            "margen_pct": margen_pct,
            "cliente_top": cliente_top,
            "concentracion_pct": concentracion_pct,
            "estado": estado,
            "estado_tipo": estado_tipo,
        })

    if not agencias:
        return _empty

    agencias.sort(key=lambda x: x["revenue"], reverse=True)

    # ── Score grupal ─────────────────────────────────────────────────────────
    margen_promedio = sum(a["margen_pct"] for a in agencias) / len(agencias)
    n_dep  = sum(1 for a in agencias if a["estado_tipo"] == "dependencia")
    n_crit = sum(1 for a in agencias if a["estado_tipo"] == "critico")
    score_grupal = round(max(0.0, min(10.0, margen_promedio / 2 - n_dep * 0.8 - n_crit * 1.5)), 1)

    # ── Grupos por estado ─────────────────────────────────────────────────────
    sanas       = [a for a in agencias if a["estado_tipo"] == "sana"]
    dependientes= [a for a in agencias if a["estado_tipo"] == "dependencia"]
    criticas    = [a for a in agencias if a["estado_tipo"] == "critico"]
    alertas     = [a for a in agencias if a["estado_tipo"] == "alerta"]

    # ── Veredicto ─────────────────────────────────────────────────────────────
    if score_grupal >= 7:
        veredicto = f"El grupo está en buen estado. {len(sanas)} de {len(agencias)} agencias operan con margen saludable y sin dependencias críticas."
    elif score_grupal >= 4:
        if dependientes:
            noms = " y ".join(a["nombre"] for a in dependientes[:2])
            veredicto = (
                f"El grupo genera ganancias, pero hay situaciones que no se pueden ignorar: "
                f"{noms} {'tiene' if len(dependientes) == 1 else 'tienen'} dependencia alta de un solo cliente — "
                f"un riesgo activo que necesita atención."
            )
        else:
            veredicto = (
                f"El grupo opera con margen promedio de {margen_promedio:.1f}%. "
                f"Hay oportunidades concretas para mejorar el resultado consolidado."
            )
    else:
        veredicto = (
            f"El grupo necesita atención. "
            f"Hay {len(criticas) + len(alertas)} agencias con margen bajo que requieren acción en el corto plazo."
        )

    # ── Cuatro preguntas ──────────────────────────────────────────────────────
    ag_riesgo    = max(agencias, key=lambda x: x["concentracion_pct"])
    ag_potencial = max(agencias, key=lambda x: x["margen_pct"])
    ag_interv    = (
        min(criticas,    key=lambda x: x["margen_pct"])       if criticas    else
        min(alertas,     key=lambda x: x["margen_pct"])       if alertas     else
        max(dependientes,key=lambda x: x["concentracion_pct"])if dependientes else
        min(agencias,    key=lambda x: x["margen_pct"])
    )

    cuatro_preguntas = {
        "salud": {
            "pregunta":  "¿Estamos sanos como grupo?",
            "respuesta": "Sí" if score_grupal >= 7 else ("Con matices" if score_grupal >= 4 else "No del todo"),
            "detalle":   veredicto,
        },
        "riesgo": {
            "pregunta":  "¿Quién depende demasiado de algo?",
            "respuesta": ag_riesgo["nombre"] if ag_riesgo["concentracion_pct"] >= 50 else "Sin riesgo crítico",
            "detalle": (
                f"{ag_riesgo['concentracion_pct']:.0f}% del revenue de {ag_riesgo['nombre']} "
                f"depende de {ag_riesgo['cliente_top']}. Si ese cliente reduce volumen, el impacto es inmediato."
                if ag_riesgo["concentracion_pct"] >= 50
                else f"Ninguna agencia supera el 50% de concentración. La más expuesta es {ag_riesgo['nombre']} con {ag_riesgo['concentracion_pct']:.0f}%."
            ),
        },
        "potencial": {
            "pregunta":  "¿Quién tiene el mejor desempeño?",
            "respuesta": ag_potencial["nombre"],
            "detalle":   (
                f"Lidera con {ag_potencial['margen_pct']:.1f}% de margen — "
                f"{round(ag_potencial['margen_pct'] - margen_promedio, 1)} puntos por encima del promedio del grupo. "
                f"Su modelo operativo es el referente."
            ),
        },
        "intervencion": {
            "pregunta":  "¿Qué necesita atención ahora?",
            "respuesta": ag_interv["nombre"],
            "detalle": (
                f"Margen de {ag_interv['margen_pct']:.1f}% — por debajo del objetivo. "
                f"Revisar estructura de costos esta semana."
                if ag_interv["estado_tipo"] in ("critico", "alerta")
                else f"Concentración del {ag_interv['concentracion_pct']:.0f}% en un solo cliente. "
                     f"Diversificar la cartera es la prioridad inmediata."
            ),
        },
    }

    # ── Insights ──────────────────────────────────────────────────────────────
    insights = []

    for a in dependientes:
        insights.append({
            "tipo":   "riesgo",
            "titulo": f"{a['nombre']} concentra el {a['concentracion_pct']:.0f}% de su revenue en un solo cliente",
            "texto":  (
                f"Si {a['cliente_top']} reduce presupuesto o cambia de agencia, "
                f"{a['nombre']} pierde {a['concentracion_pct']:.0f}% de su revenue. "
                f"No es una amenaza futura — es una vulnerabilidad activa hoy."
            ),
        })

    for a in criticas:
        insights.append({
            "tipo":   "riesgo",
            "titulo": f"{a['nombre']} opera por debajo del mínimo de rentabilidad ({a['margen_pct']:.1f}%)",
            "texto":  (
                f"Con {a['margen_pct']:.1f}% de margen, cualquier variación en costos "
                f"puede llevar a {a['nombre']} a resultado negativo. Requiere diagnóstico urgente."
            ),
        })

    if len(agencias) >= 2:
        mejor_m = max(agencias, key=lambda x: x["margen_pct"])
        peor_m  = min(agencias, key=lambda x: x["margen_pct"])
        brecha  = mejor_m["margen_pct"] - peor_m["margen_pct"]
        if brecha > 8:
            insights.append({
                "tipo":   "tension",
                "titulo": f"Brecha de {brecha:.1f} puntos de margen entre {mejor_m['nombre']} y {peor_m['nombre']}",
                "texto":  (
                    f"{mejor_m['nombre']} opera con {mejor_m['margen_pct']:.1f}% de margen mientras "
                    f"{peor_m['nombre']} tiene {peor_m['margen_pct']:.1f}%. "
                    f"Esa diferencia sugiere modelos operativos muy distintos — "
                    f"entender qué hace diferente al líder es la palanca más directa."
                ),
            })

    candidatas = [a for a in agencias if a["margen_pct"] > margen_promedio and a["concentracion_pct"] < 45]
    if candidatas:
        ref = max(candidatas, key=lambda x: x["margen_pct"])
        insights.append({
            "tipo":   "oportunidad",
            "titulo": f"El modelo de {ref['nombre']} puede replicarse en el resto del grupo",
            "texto":  (
                f"{ref['nombre']} combina {ref['margen_pct']:.1f}% de margen con cartera diversificada "
                f"({ref['concentracion_pct']:.0f}% de concentración máxima). "
                f"Trasladar sus prácticas operativas es la palanca de crecimiento más directa."
            ),
        })

    for a in agencias:
        if a["margen_pct"] > margen_promedio * 2.5 and a["margen_pct"] > 25:
            insights.append({
                "tipo":   "anomalia",
                "titulo": f"{a['nombre']} tiene un margen inusualmente alto ({a['margen_pct']:.1f}%)",
                "texto":  (
                    f"Un margen del {a['margen_pct']:.1f}% es más del doble del promedio del grupo "
                    f"({margen_promedio:.1f}%). Vale verificar si refleja el modelo real o si hay factores atípicos."
                ),
            })

    if len(agencias) >= 3:
        rev_total = sum(a["revenue"] for a in agencias)
        top2 = agencias[:2]
        if rev_total > 0:
            top2_pct = (top2[0]["revenue"] + top2[1]["revenue"]) / rev_total * 100
            if top2_pct > 60:
                insights.append({
                    "tipo":   "insight",
                    "titulo": f"{top2[0]['nombre']} y {top2[1]['nombre']} generan el {top2_pct:.0f}% del revenue del grupo",
                    "texto":  (
                        f"El resultado consolidado depende en gran medida de estas dos agencias. "
                        f"Si alguna tiene problemas, el impacto se siente en todo el grupo — "
                        f"lo que hace más importante mantenerlas monitoreadas de cerca."
                    ),
                })

    if criticas or alertas:
        urgentes = (criticas + alertas)[:2]
        nombres_u = " y ".join(a["nombre"] for a in urgentes)
        insights.append({
            "tipo":   "prioridad",
            "titulo": f"Revisar {nombres_u} esta semana",
            "texto":  (
                f"{'Esta agencia tiene' if len(urgentes) == 1 else 'Estas agencias tienen'} margen por debajo del objetivo. "
                f"La acción concreta es una revisión de P&L y reunión con el equipo "
                f"para identificar la causa raíz antes de que se deteriore más."
            ),
        })
    elif dependientes:
        a_d = dependientes[0]
        insights.append({
            "tipo":   "prioridad",
            "titulo": f"Activar diversificación de cartera en {a_d['nombre']}",
            "texto":  (
                f"Con {a_d['concentracion_pct']:.0f}% de concentración en un cliente, "
                f"el objetivo concreto es incorporar al menos 2-3 prospectos activos "
                f"para reducir esa exposición antes de fin de trimestre."
            ),
        })

    return {
        "score_grupal":     score_grupal,
        "veredicto":        veredicto,
        "agencias":         agencias,
        "cuatro_preguntas": cuatro_preguntas,
        "insights":         insights,
    }
