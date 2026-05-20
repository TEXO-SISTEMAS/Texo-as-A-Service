"""
Servicio de cruce de datos.

Orquesta el proceso completo:
1. Lee los archivos Excel ya guardados en disco para una sesión
2. Extrae los nombres de empresa de cada fuente
3. Ejecuta el motor de entity resolution
4. Persiste los resultados en matches_cruzados
5. Devuelve un resumen
"""

import pandas as pd
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.sesion import Sesion
from app.models.archivo_subido import ArchivoSubido
from app.models.entidad import Entidad
from app.models.match_cruzado import MatchCruzado
from app.models.match_global import MatchGlobal
from app.services.entity_resolver import cruzar_fuentes, generar_embedding, normalizar


def _extraer_nombres(archivo: ArchivoSubido) -> list[str]:
    """
    Lee el Excel en disco y extrae la lista de nombres únicos de empresa.
    Usa columnas_detectadas_json para saber qué columna leer.
    Si la IA no detectó la columna, usa la primera columna del archivo.
    """
    try:
        df = pd.read_excel(archivo.path_local)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No se pudo leer {archivo.nombre_archivo}: {e}",
        )

    # Determinar qué columna tiene los nombres de empresa
    columna = None
    if archivo.columnas_detectadas_json:
        columna = archivo.columnas_detectadas_json.get("columna_nombre_empresa")

    if columna and columna in df.columns:
        serie = df[columna]
    else:
        # Fallback: primera columna del archivo
        serie = df.iloc[:, 0]

    # Limpiar: eliminar nulos, convertir a string, deduplicar
    nombres = (
        serie.dropna()
        .astype(str)
        .str.strip()
        .loc[lambda s: s != ""]
        .unique()
        .tolist()
    )
    return nombres


def _extraer_nombres_erp(archivo: ArchivoSubido) -> list[str]:
    """
    Versión especializada para ERP: filtra solo estados válidos y fuerza
    el uso de la columna CLIENTE (no EMPRESA, que son unidades internas).
    """
    try:
        df = pd.read_excel(archivo.path_local)
    except Exception as e:
        raise HTTPException(status_code=422,
            detail=f"No se pudo leer {archivo.nombre_archivo}: {e}")

    ESTADOS_VALIDOS = [
        'FACTURADO',
        'FACTURA',
        'FACTURADO ',
        'FACTURA ',
        'Facturado ',
        'Facturado',
        'fACTURA',
        'FACTURAS',
    ]
    if 'ESTADO' in df.columns:
        df = df[df['ESTADO'].isin(ESTADOS_VALIDOS)]

    if 'CLIENTE' not in df.columns:
        raise HTTPException(
            status_code=422,
            detail="El archivo ERP no tiene columna 'CLIENTE'. Verificar el archivo.",
        )

    return (
        df['CLIENTE']
        .dropna()
        .astype(str)
        .str.strip()
        .loc[lambda s: s != ""]
        .unique()
        .tolist()
    )


def _get_o_crear_entidad(db: Session, nombre_normalizado: str, nombre_original: str) -> Entidad:
    """
    Busca una entidad por nombre normalizado. Si no existe, la crea.
    Maneja race conditions (UniqueViolation) con rollback + re-fetch.
    """
    entidad = db.query(Entidad).filter(
        Entidad.nombre_normalizado == nombre_normalizado
    ).first()

    if entidad:
        aliases = entidad.aliases_json or []
        if nombre_original not in aliases:
            aliases.append(nombre_original)
            entidad.aliases_json = aliases
        return entidad

    try:
        entidad = Entidad(
            nombre_normalizado=nombre_normalizado,
            aliases_json=[nombre_original],
            embedding_vector=[0.0] * 384,
        )
        db.add(entidad)
        db.flush()
        return entidad
    except Exception:
        db.rollback()
        # Alguien lo creó entre el query y el insert — buscarlo de nuevo
        return db.query(Entidad).filter(
            Entidad.nombre_normalizado == nombre_normalizado
        ).first()


def ejecutar_cruce(db: Session, sesion_id: int, usuario_id: int) -> dict:
    """
    Punto de entrada del proceso de cruce.

    Lógica:
    - Extrae nombres de cada fuente que esté disponible (no es obligatorio tener las 3)
    - Cruza ERP vs DNIT, ERP vs Marketing, DNIT vs Marketing
    - Para cada resultado, crea/actualiza la entidad y guarda el match
    - Devuelve resumen con conteos por estado
    """
    # Verificar ownership
    sesion = db.query(Sesion).filter(
        Sesion.id == sesion_id, Sesion.usuario_id == usuario_id
    ).first()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    archivos = db.query(ArchivoSubido).filter(
        ArchivoSubido.sesion_id == sesion_id
    ).all()

    if not archivos:
        raise HTTPException(status_code=400, detail="La sesión no tiene archivos subidos")

    # Protección contra doble ejecución: si ya hay matches, devolver cacheado
    matches_existentes = db.query(MatchCruzado).filter(
        MatchCruzado.sesion_id == sesion_id
    ).all()

    if matches_existentes:
        auto = sum(1 for m in matches_existentes if m.estado == "auto_confirmado")
        dudoso = sum(1 for m in matches_existentes if m.estado == "dudoso")
        sin_match = sum(1 for m in matches_existentes if m.estado == "sin_match")
        corregido = sum(1 for m in matches_existentes if m.estado == "corregido")
        return {
            "sesion_id": sesion_id,
            "total": auto + dudoso + sin_match + corregido,
            "auto_confirmado": auto + corregido,
            "dudoso": dudoso,
            "sin_match": sin_match,
            "fuentes_procesadas": [],
            "cached": True,
        }

    # Organizar archivos por fuente
    por_fuente: dict[str, ArchivoSubido] = {a.fuente_tipo: a for a in archivos}

    # Extraer nombres de cada fuente disponible (ERP usa filtro de estados)
    nombres_por_fuente: dict[str, list[str]] = {}
    for fuente, archivo in por_fuente.items():
        if fuente == "erp":
            nombres_por_fuente[fuente] = _extraer_nombres_erp(archivo)
        elif fuente in ("adlens_base", "inversion_en_medios"):
            # Marketing/Adlens se procesa unificado más abajo
            continue
        else:
            nombres_por_fuente[fuente] = _extraer_nombres(archivo)

    # Procesar Adlens unificado (adlens_base + inversion_en_medios)
    archivo_base   = por_fuente.get("adlens_base")
    archivo_medios = por_fuente.get("inversion_en_medios")

    if archivo_base or archivo_medios:
        from app.services.chat_engine import _cargar_marketing_unificado
        df_marketing = _cargar_marketing_unificado(archivo_base, archivo_medios)
        if df_marketing is not None and 'anunciante' in df_marketing.columns:
            nombres_por_fuente["marketing"] = (
                df_marketing['anunciante']
                .dropna()
                .astype(str)
                .str.strip()
                .loc[lambda s: s != ""]
                .unique()
                .tolist()
            )

    # Logs de diagnóstico
    print(f"Fuentes detectadas: {list(nombres_por_fuente.keys())}")
    print(f"Nombres ERP: {len(nombres_por_fuente.get('erp', []))}")
    print(f"Nombres DNIT: {len(nombres_por_fuente.get('dnit', []))}")
    print(f"Nombres marketing: {len(nombres_por_fuente.get('marketing', []))}")

    # Eliminar matches previos de esta sesión para recalcular
    db.query(MatchCruzado).filter(MatchCruzado.sesion_id == sesion_id).delete()

    conteo = {"auto_confirmado": 0, "dudoso": 0, "sin_match": 0}

    # ERP es siempre la fuente base — nunca cruzar DNIT × Marketing
    fuente_base = "erp"
    if fuente_base not in nombres_por_fuente:
        raise HTTPException(status_code=400,
            detail="Se requiere el archivo ERP para el cruce")

    otras_fuentes = [f for f in nombres_por_fuente if f != fuente_base]

    campo_fuente = {
        "erp":       "fuente1_nombre",
        "dnit":      "fuente2_nombre",
        "marketing": "fuente3_nombre",
    }

    for fuente_b in otras_fuentes:
        resultados = cruzar_fuentes(
            nombres_por_fuente[fuente_base],
            nombres_por_fuente[fuente_b],
            usar_semantico=True,
        )
        for res in resultados:
            norm = normalizar(res.nombre_a)
            entidad = _get_o_crear_entidad(db, norm, res.nombre_a)

            # Consultar memoria global de matches
            match_global = db.query(MatchGlobal).filter(
                MatchGlobal.nombre_erp     == res.nombre_a,
                MatchGlobal.nombre_fuente2 == res.nombre_b,
                MatchGlobal.tipo_fuente2   == fuente_b,
            ).first()

            estado = match_global.estado if match_global else res.estado

            match = MatchCruzado(
                sesion_id=sesion_id,
                entidad_id=entidad.id,
                score=res.score,
                estado=estado,
                corregido_por_usuario=False,
            )
            setattr(match, campo_fuente[fuente_base], res.nombre_a)
            setattr(match, campo_fuente.get(fuente_b, "fuente2_nombre"), res.nombre_b)
            db.add(match)
            conteo[estado] = conteo.get(estado, 0) + 1

    db.commit()

    total = sum(conteo.values())
    return {
        "sesion_id": sesion_id,
        "total": total,
        "auto_confirmado": conteo.get("auto_confirmado", 0),
        "dudoso": conteo.get("dudoso", 0),
        "sin_match": conteo.get("sin_match", 0),
        "fuentes_procesadas": list(nombres_por_fuente.keys()),
    }
