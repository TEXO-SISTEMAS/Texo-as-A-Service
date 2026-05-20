"""
Tests unitarios del motor de entity resolution.

Correr con:
    cd backend
    pytest tests/test_entity_resolver.py -v

No requieren base de datos ni API keys — prueban la lógica pura.
"""

import pytest
from app.services.entity_resolver import (
    normalizar,
    match_exacto,
    match_fuzzy,
    resolver_par,
    fuzzy_score,
)


# ---------------------------------------------------------------------------
# Tests de normalización
# ---------------------------------------------------------------------------

class TestNormalizar:
    def test_lowercase(self):
        assert normalizar("COCA COLA") == "coca cola"

    def test_elimina_puntuacion(self):
        assert normalizar("Coca-Cola S.R.L.") == "coca cola"

    def test_elimina_stopwords_srl(self):
        assert normalizar("Empresa SRL") == "empresa"

    def test_elimina_stopwords_sa(self):
        assert normalizar("Empresa SA") == "empresa"

    def test_elimina_stopwords_del(self):
        assert normalizar("Refrescos del Paraguay") == "refrescos paraguay"

    def test_elimina_acentos(self):
        assert normalizar("Distribución Ñandú") == "distribucion nandu"

    def test_colapsa_espacios(self):
        assert normalizar("Coca   Cola") == "coca cola"

    def test_string_vacio(self):
        assert normalizar("") == ""

    def test_none(self):
        assert normalizar(None) == ""


# ---------------------------------------------------------------------------
# Tests Capa 1 — Match exacto
# ---------------------------------------------------------------------------

class TestMatchExacto:
    def test_mismo_nombre(self):
        resultado = match_exacto("Coca Cola", "Coca Cola")
        assert resultado is not None
        assert resultado.score == 1.0
        assert resultado.estado == "auto_confirmado"
        assert resultado.metodo == "exacto"

    def test_mismo_nombre_diferente_case(self):
        resultado = match_exacto("COCA COLA", "coca cola")
        assert resultado is not None
        assert resultado.score == 1.0

    def test_mismo_nombre_con_stopword(self):
        # "Coca Cola SRL" y "Coca Cola SA" → ambos normalizan a "coca cola"
        resultado = match_exacto("Coca Cola SRL", "Coca Cola SA")
        assert resultado is not None
        assert resultado.score == 1.0

    def test_nombres_diferentes(self):
        resultado = match_exacto("Coca Cola", "Pepsi")
        assert resultado is None

    def test_con_puntuacion(self):
        resultado = match_exacto("Coca-Cola S.R.L.", "Coca Cola")
        assert resultado is not None


# ---------------------------------------------------------------------------
# Tests Capa 2 — Fuzzy match
# ---------------------------------------------------------------------------

class TestMatchFuzzy:
    def test_nombres_identicos(self):
        resultado = match_fuzzy("Coca Cola", "Coca Cola")
        assert resultado.score == 1.0
        assert resultado.estado == "auto_confirmado"

    def test_variacion_menor(self):
        # "Coca Cola" vs "Coca-Cola SRL" — deben ser auto confirmado
        resultado = match_fuzzy("Coca Cola", "Coca-Cola SRL")
        assert resultado.score >= 0.85
        assert resultado.estado == "auto_confirmado"

    def test_variacion_media(self):
        # "Coca Cola" vs "Coca y Cola" — dudoso
        resultado = match_fuzzy("Coca Cola", "Coca y Cola")
        assert resultado.score >= 0.60
        # puede ser auto o dudoso según el score exacto

    def test_nombres_muy_diferentes(self):
        resultado = match_fuzzy("Coca Cola", "Refrescos Paraguay SRL")
        assert resultado.estado == "sin_match"

    def test_orden_tokens(self):
        # token_sort_ratio debe manejar orden diferente de palabras
        score = fuzzy_score("Cola Coca", "Coca Cola")
        assert score >= 0.95

    def test_estado_auto(self):
        resultado = match_fuzzy("Empresa ABC", "Empresa ABC SRL")
        assert resultado.estado == "auto_confirmado"

    def test_metodo_es_fuzzy(self):
        resultado = match_fuzzy("Coca Cola", "Pepsi")
        assert resultado.metodo == "fuzzy"


# ---------------------------------------------------------------------------
# Tests función principal — resolver_par
# ---------------------------------------------------------------------------

class TestResolverPar:
    def test_match_exacto_prioridad(self):
        # Cuando hay match exacto, no debe llegar a fuzzy
        resultado = resolver_par("Coca Cola SRL", "Coca Cola SA", usar_semantico=False)
        assert resultado.metodo == "exacto"
        assert resultado.score == 1.0

    def test_fallback_a_fuzzy(self):
        # Nombres sin match exacto pero similares → fuzzy
        resultado = resolver_par("Empresa ABC", "Empresa A.B.C.", usar_semantico=False)
        assert resultado.score >= 0.60

    def test_nombres_completamente_diferentes(self):
        resultado = resolver_par("Coca Cola", "Refrescos Paraguay", usar_semantico=False)
        assert resultado.estado == "sin_match"

    def test_sin_semantico_no_usa_embeddings(self):
        # Con usar_semantico=False, si fuzzy da sin_match, no se llama al modelo
        resultado = resolver_par("XYZ Corp", "ABC Ltda", usar_semantico=False)
        assert resultado.metodo in ("exacto", "fuzzy")  # nunca "semantico"

    def test_casos_reales_erp_vs_dnit(self):
        """Casos típicos del proyecto: ERP vs DNIT con inconsistencias de nombres."""
        casos = [
            ("Distribuidora Norte SA",   "Distribuidora Norte SRL", "auto_confirmado"),
            ("Super Norte",              "Supermercado Norte",       None),  # score variable
            ("ABC Empresa",              "ZYX Corp",                 "sin_match"),
        ]
        for nombre_a, nombre_b, estado_esperado in casos:
            resultado = resolver_par(nombre_a, nombre_b, usar_semantico=False)
            if estado_esperado:
                assert resultado.estado == estado_esperado, (
                    f"'{nombre_a}' vs '{nombre_b}': "
                    f"esperado '{estado_esperado}', obtenido '{resultado.estado}' (score={resultado.score:.2f})"
                )
