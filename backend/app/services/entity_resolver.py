"""
Motor de entity resolution en 3 capas.

Resuelve el problema de que "Coca Cola SRL", "COCA COLA" y "Coca-Cola S.R.L."
son la misma empresa pero aparecen escritas diferente en cada fuente Excel.

Flujo para cada par de nombres:
  1. Normalizar → comparar exacto
  2. Si no matchea → fuzzy con RapidFuzz
  3. Si no matchea → semántico (deshabilitado sin pgvector)
"""

import re
import unicodedata
from dataclasses import dataclass
from typing import Optional

from rapidfuzz import fuzz

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

# Palabras que no aportan identidad a una empresa — se eliminan antes de comparar
STOPWORDS = {"srl", "sa", "sac", "del", "de", "la", "los", "las", "el", "y",
             "s", "r", "l", "a", "c", "inc", "corp", "ltd", "company", "cia"}

# Umbrales por capa
FUZZY_AUTO = 0.85       # >= 85% → auto confirmado
FUZZY_DUDOSO = 0.75     # 75–84% → requiere confirmación del usuario (< 75% = sin_match)
SEMANTIC_AUTO = 0.80    # >= 80% → auto confirmado
SEMANTIC_DUDOSO = 0.60  # 60–79% → dudoso


# ---------------------------------------------------------------------------
# Resultado de un match
# ---------------------------------------------------------------------------

@dataclass
class MatchResult:
    nombre_a: str
    nombre_b: str
    score: float
    metodo: str          # "exacto" | "fuzzy" | "semantico"
    estado: str          # "auto_confirmado" | "dudoso" | "sin_match"


# ---------------------------------------------------------------------------
# CAPA 1 — Normalización
# ---------------------------------------------------------------------------

def normalizar(nombre: str) -> str:
    """
    Convierte un nombre de empresa a su forma canónica para comparación.
    Metodología validada contra datos reales ERP/DNIT Paraguay.

    Pasos:
    1. Mayúsculas + strip
    2. Eliminar acentos (para comparación robusta)
    3. Eliminar formas jurídicas (SA, SRL, S.A., SAECA, LTDA, etc.)
    4. Eliminar caracteres no alfanuméricos
    5. Colapsar espacios

    Ejemplo:
        "Cervepar S.A."        →  "CERVEPAR"
        "REFRESCOS DEL PY SRL" →  "REFRESCOS DEL PY"
        "Banco Itaú S.A.E.C.A." → "BANCO ITAU"
    """
    if not nombre or not isinstance(nombre, str):
        return ""

    # 1. Mayúsculas
    s = str(nombre).upper().strip()

    # 2. Eliminar acentos
    s = unicodedata.normalize("NFKD", s)
    s = s.encode("ascii", "ignore").decode("ascii")

    # 3. Eliminar formas jurídicas comunes en Paraguay
    s = re.sub(
        r"\b(SA|SRL|LTDA|S\.A\.|S\.R\.L\.|SOCIEDAD ANONIMA|SOCIEDAD ANONIMA|"
        r"S\.A|SACI|SAECA|S\.A\.E\.C\.A\.|SAE|EMISORA DE CAPITAL ABIERTO)\b",
        "", s
    )

    # 4. Eliminar caracteres no alfanuméricos (puntos, comas, guiones, etc.)
    s = re.sub(r"[^\w\s]", " ", s)

    # 5. Colapsar espacios múltiples
    s = re.sub(r"\s+", " ", s).strip()

    return s


# ---------------------------------------------------------------------------
# CAPA 2 — Fuzzy match (RapidFuzz)
# ---------------------------------------------------------------------------

def fuzzy_score(nombre_a: str, nombre_b: str) -> float:
    """
    Calcula similitud entre dos nombres normalizados usando dos métricas
    y devuelve el mayor score:

    - fuzz.ratio: similitud caracter a caracter (sensible al orden)
    - fuzz.token_sort_ratio: igual pero ordena los tokens alfabéticamente
      antes de comparar → "Cola Coca" == "Coca Cola"

    Nombres de 4 caracteres o menos reciben una penalización del 10%
    para reducir falsos positivos (ej: "ABC" vs "ABD").

    Devuelve score entre 0.0 y 1.0.
    """
    norm_a = normalizar(nombre_a)
    norm_b = normalizar(nombre_b)

    if not norm_a or not norm_b:
        return 0.0

    if norm_a == norm_b:
        return 1.0

    # Nombres muy cortos son peligrosos
    if len(norm_a) <= 4 or len(norm_b) <= 4:
        score_ratio = fuzz.ratio(norm_a, norm_b) / 100.0
        score_token = fuzz.token_sort_ratio(norm_a, norm_b) / 100.0
        return max(score_ratio, score_token) * 0.90

    score_ratio = fuzz.ratio(norm_a, norm_b) / 100.0
    score_token = fuzz.token_sort_ratio(norm_a, norm_b) / 100.0
    return max(score_ratio, score_token)


def _estado_por_score(score: float, umbral_auto: float, umbral_dudoso: float) -> str:
    if score >= umbral_auto:
        return "auto_confirmado"
    if score >= umbral_dudoso:
        return "dudoso"
    return "sin_match"


def match_exacto(nombre_a: str, nombre_b: str) -> Optional[MatchResult]:
    """Capa 1: compara tras normalización. Score 1.0 si son iguales, None si no."""
    if normalizar(nombre_a) == normalizar(nombre_b):
        return MatchResult(
            nombre_a=nombre_a,
            nombre_b=nombre_b,
            score=1.0,
            metodo="exacto",
            estado="auto_confirmado",
        )
    return None


def match_fuzzy(nombre_a: str, nombre_b: str) -> MatchResult:
    """Capa 2: fuzzy con RapidFuzz. Siempre devuelve un resultado."""
    score = fuzzy_score(nombre_a, nombre_b)
    return MatchResult(
        nombre_a=nombre_a,
        nombre_b=nombre_b,
        score=score,
        metodo="fuzzy",
        estado=_estado_por_score(score, FUZZY_AUTO, FUZZY_DUDOSO),
    )


# ---------------------------------------------------------------------------
# CAPA 3 — Semántico (pgvector + sentence-transformers)
# ---------------------------------------------------------------------------

def get_embedding_model():
    """
    Capa semántica deshabilitada: torch incompatible con este entorno.
    Devuelve None para que las funciones que dependen del modelo lo salteen.
    """
    return None


def generar_embedding(nombre: str) -> list[float]:
    """Genera el vector de embeddings. Devuelve lista vacía si el modelo no está disponible."""
    model = get_embedding_model()
    if model is None:
        return []
    vector = model.encode(normalizar(nombre))
    return vector.tolist()


def match_semantico(nombre_a: str, nombre_b: str) -> MatchResult:
    """
    Capa 3: deshabilitada mientras el modelo no esté disponible.
    Devuelve sin_match con score 0.
    """
    model = get_embedding_model()
    if model is None:
        return MatchResult(
            nombre_a=nombre_a,
            nombre_b=nombre_b,
            score=0.0,
            metodo="semantico",
            estado="sin_match",
        )

    import numpy as np
    norm_a = normalizar(nombre_a)
    norm_b = normalizar(nombre_b)

    vec_a = model.encode(norm_a)
    vec_b = model.encode(norm_b)

    score = float(np.dot(vec_a, vec_b) / (np.linalg.norm(vec_a) * np.linalg.norm(vec_b)))
    score = max(0.0, min(1.0, score))

    return MatchResult(
        nombre_a=nombre_a,
        nombre_b=nombre_b,
        score=score,
        metodo="semantico",
        estado=_estado_por_score(score, SEMANTIC_AUTO, SEMANTIC_DUDOSO),
    )


# ---------------------------------------------------------------------------
# Función principal: corre las 3 capas en orden
# ---------------------------------------------------------------------------

def resolver_par(nombre_a: str, nombre_b: str, usar_semantico: bool = True) -> MatchResult:
    """
    Corre las 3 capas en orden para un par de nombres.
    Se detiene en la primera que da resultado conclusivo (auto o sin_match por score).

    La capa semántica es cara computacionalmente, por eso se salta si el fuzzy
    ya dio sin_match con score muy bajo (< 0.40), que indica que son claramente
    diferentes.
    """
    # Capa 1
    resultado = match_exacto(nombre_a, nombre_b)
    if resultado:
        return resultado

    # Capa 2
    resultado = match_fuzzy(nombre_a, nombre_b)
    if resultado.estado in ("auto_confirmado", "dudoso"):
        return resultado

    # Si el fuzzy fue muy bajo, skip semántico (ahorra tiempo)
    # También se saltea si el modelo no está disponible
    if not usar_semantico or resultado.score < 0.40 or get_embedding_model() is None:
        return resultado

    # Capa 3
    resultado_sem = match_semantico(nombre_a, nombre_b)
    if resultado_sem.estado != "sin_match":
        return resultado_sem

    # Devuelve el mejor score entre fuzzy y semántico
    if resultado_sem.score > resultado.score:
        return resultado_sem
    return resultado


def cruzar_fuentes(
    nombres_a: list[str],
    nombres_b: list[str],
    usar_semantico: bool = True,
) -> list[MatchResult]:
    """
    Cruza dos listas de nombres (ej: todos los de ERP vs todos los de DNIT).
    Para cada nombre en A, busca el mejor match en B.

    Complejidad: O(n*m) — para MVP con cientos de empresas es aceptable.
    """
    resultados = []
    for nombre_a in nombres_a:
        mejor: Optional[MatchResult] = None
        for nombre_b in nombres_b:
            candidato = resolver_par(nombre_a, nombre_b, usar_semantico)
            if mejor is None or candidato.score > mejor.score:
                mejor = candidato
        if mejor:
            resultados.append(mejor)
    return resultados
