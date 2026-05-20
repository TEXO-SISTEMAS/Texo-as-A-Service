"""Agrega tablas datos_erp, datos_dnit, datos_marketing para almacenar datos de Excel en BD

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "datos_erp",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("sesion_id", sa.Integer, sa.ForeignKey("sesiones.id"), nullable=False),
        sa.Column("archivo_id", sa.Integer, sa.ForeignKey("archivos_subidos.id"), nullable=False),
        sa.Column("cliente", sa.String, nullable=False),
        sa.Column("empresa", sa.String, nullable=True),
        sa.Column("estado", sa.String, nullable=True),
        sa.Column("facturacion", sa.Float, nullable=True),
        sa.Column("costo", sa.Float, nullable=True),
        sa.Column("revenue", sa.Float, nullable=True),
        sa.Column("fecha_factura", sa.Date, nullable=True),
        sa.Column("ano", sa.Integer, nullable=True),
    )

    op.create_table(
        "datos_dnit",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("sesion_id", sa.Integer, sa.ForeignKey("sesiones.id"), nullable=False),
        sa.Column("archivo_id", sa.Integer, sa.ForeignKey("archivos_subidos.id"), nullable=False),
        sa.Column("nombre_empresa", sa.String, nullable=False),
        sa.Column("ranking", sa.Integer, nullable=True),
        sa.Column("ingreso_estimado_gs", sa.Float, nullable=True),
    )

    op.create_table(
        "datos_marketing",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("sesion_id", sa.Integer, sa.ForeignKey("sesiones.id"), nullable=False),
        sa.Column("archivo_id", sa.Integer, sa.ForeignKey("archivos_subidos.id"), nullable=False),
        sa.Column("anunciante", sa.String, nullable=False),
        sa.Column("rubroprincipal", sa.String, nullable=True),
        sa.Column("tipodecluster", sa.String, nullable=True),
        sa.Column("puntajetotal", sa.Float, nullable=True),
        sa.Column("cultura", sa.Float, nullable=True),
        sa.Column("ejecucion", sa.Float, nullable=True),
        sa.Column("estructura", sa.Float, nullable=True),
        sa.Column("competitividad", sa.Float, nullable=True),
        sa.Column("inv_total_gs", sa.Float, nullable=True),
        sa.Column("inv_total_usd", sa.Float, nullable=True),
        sa.Column("n_registros", sa.Integer, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("datos_marketing")
    op.drop_table("datos_dnit")
    op.drop_table("datos_erp")
