"""Agrega columnas ruc, razon_social y aporte_gs a datos_dnit

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("datos_dnit", sa.Column("ruc", sa.String, nullable=True))
    op.add_column("datos_dnit", sa.Column("razon_social", sa.String, nullable=True))
    op.add_column("datos_dnit", sa.Column("aporte_gs", sa.Float, nullable=True))
    op.create_index("ix_datos_dnit_ruc", "datos_dnit", ["ruc"])


def downgrade() -> None:
    op.drop_index("ix_datos_dnit_ruc", table_name="datos_dnit")
    op.drop_column("datos_dnit", "aporte_gs")
    op.drop_column("datos_dnit", "razon_social")
    op.drop_column("datos_dnit", "ruc")
