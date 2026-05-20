"""Reemplaza datos_marketing con datos_adlens_base y datos_inversion_medios

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("datos_marketing")

    op.create_table(
        "datos_adlens_base",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("sesion_id", sa.Integer, sa.ForeignKey("sesiones.id"), nullable=False),
        sa.Column("archivo_id", sa.Integer, sa.ForeignKey("archivos_subidos.id"), nullable=False),
        # Identificación
        sa.Column("anunciante", sa.String, nullable=False),
        sa.Column("rubro_principal", sa.String),
        sa.Column("central_de_medios", sa.String),
        sa.Column("nombre_gerente_marketing", sa.String),
        sa.Column("nombre_dueno", sa.String),
        sa.Column("sitio_web", sa.String),
        # Perfil de empresa
        sa.Column("tipo_empresa", sa.String),
        sa.Column("tamano_empresa", sa.String),
        sa.Column("tipo_marca", sa.String),
        sa.Column("marcas", sa.String),
        # Estructura organizacional
        sa.Column("tiene_depto_compras", sa.String),
        sa.Column("tiene_depto_marketing", sa.String),
        sa.Column("tiene_presupuesto_anual", sa.String),
        sa.Column("modalidad_proyectos", sa.String),
        sa.Column("decisiones_autonomas", sa.String),
        sa.Column("aprobacion_decisiones", sa.String),
        sa.Column("contacto_externo", sa.String),
        sa.Column("tamano_equipo_marketing", sa.String),
        # Marca y posicionamiento
        sa.Column("estadio_brand_funnel", sa.String),
        sa.Column("market_share", sa.String),
        sa.Column("medios_principales", sa.String),
        sa.Column("afinidad_servicios", sa.String),
        sa.Column("busca_innovacion", sa.String),
        sa.Column("perfil_empresa", sa.String),
        sa.Column("trabaja_construccion_marca", sa.String),
        # Cultura y RSE
        sa.Column("tiene_cultura_org", sa.String),
        sa.Column("tiene_rse", sa.String),
        sa.Column("rse_alineado_marca", sa.String),
        # Digital
        sa.Column("interlocutor_digital", sa.String),
        sa.Column("invierte_marketing_digital", sa.String),
        sa.Column("impacto_pandemia_digital", sa.String),
        sa.Column("tiene_depto_digital", sa.String),
        sa.Column("tiene_estrategia_digital", sa.String),
        sa.Column("foco_pauta_digital", sa.String),
        sa.Column("plataforma_digital_principal", sa.String),
        # Datos y CRM
        sa.Column("trabaja_datos_clientes", sa.String),
        sa.Column("tipo_sistema", sa.String),
        sa.Column("tiene_crm", sa.String),
        sa.Column("crm_integrado", sa.String),
        sa.Column("tiene_programa_fidelidad", sa.String),
        # Innovación
        sa.Column("ultima_innovacion", sa.String),
        sa.Column("invierte_research", sa.String),
        sa.Column("invierte_pdv", sa.String),
        sa.Column("invierte_investigacion", sa.String),
        sa.Column("nivel_desconfianza", sa.String),
        # Inversión por medio (miles USD)
        sa.Column("inv_tv_abierta_usd", sa.Float),
        sa.Column("inv_radio_usd", sa.Float),
        sa.Column("inv_cable_usd", sa.Float),
        sa.Column("inv_revistas_usd", sa.Float),
        sa.Column("inv_diarios_usd", sa.Float),
        sa.Column("inv_pdv_usd", sa.Float),
        sa.Column("rango_inversion", sa.Float),
        sa.Column("inversion_en_medios", sa.Float),
        # Scores numéricos
        sa.Column("score_perfil_empresa", sa.Float),
        sa.Column("score_construccion_marca", sa.Float),
        sa.Column("score_horizonte_plazo", sa.Float),
        sa.Column("score_importancia_estrategia", sa.Float),
        sa.Column("score_presupuesto_anual", sa.Float),
        sa.Column("score_decisiones_autonomas", sa.Float),
        sa.Column("score_importancia_diseno", sa.Float),
        sa.Column("score_innovacion_publicidad", sa.Float),
        sa.Column("score_desconfianza", sa.Float),
        sa.Column("score_afinidad_servicios", sa.Float),
        sa.Column("score_depto_compras", sa.Float),
        sa.Column("score_area_marketing", sa.Float),
        sa.Column("score_tamano_equipo", sa.Float),
        sa.Column("score_tamano_empresa", sa.Float),
        sa.Column("score_depto_digital", sa.Float),
        sa.Column("score_marcas", sa.Float),
        sa.Column("score_brand_funnel", sa.Float),
        sa.Column("score_market_share", sa.Float),
        sa.Column("score_invierte_digital", sa.Float),
        sa.Column("score_invierte_research", sa.Float),
        sa.Column("score_invierte_pdv", sa.Float),
        sa.Column("score_invierte_investigacion", sa.Float),
        # Métricas de madurez
        sa.Column("puntaje_total", sa.Float),
        sa.Column("cluster", sa.Float),
        sa.Column("tipo_cluster", sa.Float),
        sa.Column("cultura", sa.Float),
        sa.Column("ejecucion", sa.Float),
        sa.Column("estructura", sa.Float),
        sa.Column("competitividad", sa.Float),
        sa.Column("inversion", sa.Float),
        sa.Column("z_cultura", sa.Float),
        sa.Column("z_ejecucion", sa.Float),
        sa.Column("z_estructura", sa.Float),
        sa.Column("z_competitividad", sa.Float),
        sa.Column("z_inversion", sa.Float),
        sa.Column("formula_pc1", sa.Float),
        sa.Column("formula_pc2", sa.Float),
    )
    op.create_index("ix_datos_adlens_base_sesion_id", "datos_adlens_base", ["sesion_id"])
    op.create_index("ix_datos_adlens_base_anunciante", "datos_adlens_base", ["anunciante"])

    op.create_table(
        "datos_inversion_medios",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("sesion_id", sa.Integer, sa.ForeignKey("sesiones.id"), nullable=False),
        sa.Column("archivo_id", sa.Integer, sa.ForeignKey("archivos_subidos.id"), nullable=False),
        sa.Column("setor", sa.String),
        sa.Column("categoria", sa.String),
        sa.Column("anunciante", sa.String, nullable=False),
        sa.Column("agencia", sa.String),
        sa.Column("medio", sa.String),
        sa.Column("veiculo", sa.String),
        sa.Column("grupo_empresarial", sa.String),
        sa.Column("mes", sa.String),
        sa.Column("ano", sa.Integer),
        sa.Column("monto_gs", sa.Float),
        sa.Column("monto_usd", sa.Float),
        sa.Column("descuento_pct", sa.Float),
        sa.Column("rango_inversion", sa.Float),
    )
    op.create_index("ix_datos_inversion_medios_sesion_id", "datos_inversion_medios", ["sesion_id"])
    op.create_index("ix_datos_inversion_medios_anunciante", "datos_inversion_medios", ["anunciante"])
    op.create_index("ix_datos_inversion_medios_medio", "datos_inversion_medios", ["medio"])
    op.create_index("ix_datos_inversion_medios_ano", "datos_inversion_medios", ["ano"])


def downgrade() -> None:
    op.drop_table("datos_inversion_medios")
    op.drop_table("datos_adlens_base")
    op.create_table(
        "datos_marketing",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("sesion_id", sa.Integer, sa.ForeignKey("sesiones.id"), nullable=False),
        sa.Column("archivo_id", sa.Integer, sa.ForeignKey("archivos_subidos.id"), nullable=False),
        sa.Column("anunciante", sa.String, nullable=False),
        sa.Column("rubroprincipal", sa.String),
        sa.Column("tipodecluster", sa.String),
        sa.Column("puntajetotal", sa.Float),
        sa.Column("cultura", sa.Float),
        sa.Column("ejecucion", sa.Float),
        sa.Column("estructura", sa.Float),
        sa.Column("competitividad", sa.Float),
        sa.Column("inv_total_gs", sa.Float),
        sa.Column("inv_total_usd", sa.Float),
        sa.Column("n_registros", sa.Integer),
    )
