import os
import json
import httpx
import pandas as pd

MISTRAL_MODEL = "mistral-small-latest"
MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"


def detect_columns(df: pd.DataFrame, fuente_tipo: str) -> dict:
    """
    Envía las primeras 3 filas del DataFrame a Mistral para que identifique
    qué columna contiene el nombre de la empresa/cliente.

    Decisión de privacidad: NUNCA se envía el archivo completo.
    Solo se envía la lista de columnas + 3 filas de muestra.
    Esto minimiza los datos que salen de la máquina.

    Devuelve un dict con al menos:
      { "columna_nombre_empresa": "NombreColumna", "otras_columnas": {...} }
    """
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        return {"columna_nombre_empresa": None, "error": "MISTRAL_API_KEY no configurada"}

    # Construir el sample: solo columnas + primeras 3 filas
    columnas = list(df.columns)
    muestra = df.head(3).to_dict(orient="records")

    prompt = f"""Tenés un archivo Excel de tipo "{fuente_tipo}" con estas columnas y datos de muestra:

Columnas: {columnas}
Primeras 3 filas: {json.dumps(muestra, ensure_ascii=False, default=str)}

Tu tarea:
1. Identificá qué columna contiene el nombre de la empresa o cliente.
2. Identificá otras columnas relevantes (monto, fecha, RUC, categoría, etc.) si existen.

Respondé SOLO con un JSON válido con esta estructura exacta, sin texto adicional:
{{
  "columna_nombre_empresa": "nombre_exacto_de_la_columna",
  "otras_columnas": {{
    "descripcion_semantica": "nombre_exacto_de_la_columna"
  }}
}}"""

    try:
        response = httpx.post(
            MISTRAL_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": MISTRAL_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            },
            timeout=30,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception as e:
        # Si la IA falla, el archivo igual se guarda — la detección queda pendiente
        return {"columna_nombre_empresa": None, "error": str(e)}
