import os
import shutil
import pandas as pd
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session

from app.models.sesion import Sesion
from app.models.archivo_subido import ArchivoSubido
from app.services.column_detector import detect_columns
from app.services.importar_datos import importar_excel

# Directorio base donde se guardan los archivos subidos
UPLOAD_BASE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "uploads")
FUENTES_VALIDAS = {"erp", "dnit", "marketing", "adlens_base", "inversion_en_medios"}


def crear_sesion(db: Session, usuario_id: int, nombre_sesion: str) -> Sesion:
    sesion = Sesion(usuario_id=usuario_id, nombre_sesion=nombre_sesion)
    db.add(sesion)
    db.commit()
    db.refresh(sesion)
    return sesion


def listar_sesiones(db: Session, usuario_id: int) -> list[Sesion]:
    return (
        db.query(Sesion)
        .filter(Sesion.usuario_id == usuario_id)
        .order_by(Sesion.created_at.desc())
        .all()
    )


async def procesar_archivo(
    db: Session,
    sesion_id: int,
    usuario_id: int,
    fuente_tipo: str,
    file: UploadFile,
) -> ArchivoSubido:
    """
    Flujo completo de procesamiento de un Excel:
    1. Valida que la sesión pertenezca al usuario (evita acceso cruzado)
    2. Valida el tipo de fuente y la extensión del archivo
    3. Guarda el archivo en disco
    4. Lee con pandas y envía muestra a la IA
    5. Persiste el resultado en BD
    """
    # 1. Verificar que la sesión exista y sea del usuario autenticado
    sesion = db.query(Sesion).filter(
        Sesion.id == sesion_id, Sesion.usuario_id == usuario_id
    ).first()
    if not sesion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada")

    # 2. Validar fuente_tipo y extensión
    if fuente_tipo not in FUENTES_VALIDAS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"fuente_tipo debe ser uno de: {FUENTES_VALIDAS}",
        )
    nombre = file.filename or "archivo.xlsx"
    if not nombre.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se aceptan archivos Excel (.xlsx, .xls)",
        )

    # 3. Si ya existe un archivo del mismo fuente_tipo en esta sesión, eliminarlo
    archivo_existente = db.query(ArchivoSubido).filter(
        ArchivoSubido.sesion_id == sesion_id,
        ArchivoSubido.fuente_tipo == fuente_tipo,
    ).first()
    if archivo_existente:
        if os.path.exists(archivo_existente.path_local):
            os.remove(archivo_existente.path_local)
        db.delete(archivo_existente)
        db.flush()

    # 4. Guardar en disco en /data/uploads/{sesion_id}/
    carpeta = os.path.join(UPLOAD_BASE, str(sesion_id))
    os.makedirs(carpeta, exist_ok=True)
    path_local = os.path.join(carpeta, f"{fuente_tipo}_{nombre}")

    with open(path_local, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # 5. Leer con pandas y detectar columnas con IA
    try:
        df = pd.read_excel(path_local)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No se pudo leer el Excel: {e}",
        )

    columnas_detectadas = detect_columns(df, fuente_tipo)

    # 6. Persistir en BD
    archivo = ArchivoSubido(
        sesion_id=sesion_id,
        fuente_tipo=fuente_tipo,
        nombre_archivo=nombre,
        path_local=path_local,
        columnas_detectadas_json=columnas_detectadas,
    )
    db.add(archivo)
    db.commit()
    db.refresh(archivo)

    # 7. Importar datos del Excel a la BD (evita releer el archivo en cada chat)
    importar_excel(db, archivo)

    return archivo


def listar_archivos(db: Session, sesion_id: int, usuario_id: int) -> list[ArchivoSubido]:
    # Verifica ownership antes de listar
    sesion = db.query(Sesion).filter(
        Sesion.id == sesion_id, Sesion.usuario_id == usuario_id
    ).first()
    if not sesion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada")
    return db.query(ArchivoSubido).filter(ArchivoSubido.sesion_id == sesion_id).all()
