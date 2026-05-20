"""Migración inicial — crea todas las tablas del MVP

Revision ID: 0001
Revises:
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nota: pgvector no se usa en esta versión para simplificar la instalación
    # El embedding_vector se almacena como texto JSON

    op.create_table(
        "usuarios",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String, nullable=False, unique=True),
        sa.Column("password_hash", sa.String, nullable=False),
        sa.Column("nombre", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "sesiones",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("usuario_id", sa.Integer, sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("nombre_sesion", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "archivos_subidos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("sesion_id", sa.Integer, sa.ForeignKey("sesiones.id"), nullable=False),
        sa.Column("fuente_tipo", sa.String, nullable=False),
        sa.Column("nombre_archivo", sa.String, nullable=False),
        sa.Column("path_local", sa.String, nullable=False),
        sa.Column("columnas_detectadas_json", sa.JSON, nullable=True),
    )

    op.create_table(
        "entidades",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nombre_normalizado", sa.String, nullable=False, unique=True),
        sa.Column("aliases_json", sa.JSON, nullable=True),
        sa.Column("embedding_vector", sa.Text, nullable=True),  # Embedding como texto JSON (pgvector no instalado)
    )

    op.create_table(
        "matches_cruzados",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("sesion_id", sa.Integer, sa.ForeignKey("sesiones.id"), nullable=False),
        sa.Column("entidad_id", sa.Integer, sa.ForeignKey("entidades.id"), nullable=True),
        sa.Column("fuente1_nombre", sa.String, nullable=True),
        sa.Column("fuente2_nombre", sa.String, nullable=True),
        sa.Column("fuente3_nombre", sa.String, nullable=True),
        sa.Column("score", sa.Float, nullable=True),
        sa.Column("estado", sa.String, nullable=False, server_default="pendiente"),
        sa.Column("corregido_por_usuario", sa.Boolean, default=False),
    )

    op.create_table(
        "conversaciones",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("sesion_id", sa.Integer, sa.ForeignKey("sesiones.id"), nullable=False),
        sa.Column("usuario_id", sa.Integer, sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "mensajes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("conversacion_id", sa.Integer, sa.ForeignKey("conversaciones.id"), nullable=False),
        sa.Column("rol", sa.String, nullable=False),
        sa.Column("contenido", sa.Text, nullable=False),
        sa.Column("grafico_json", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    # Elimina las tablas en orden inverso (respetando foreign keys)
    op.drop_table("mensajes")
    op.drop_table("conversaciones")
    op.drop_table("matches_cruzados")
    op.drop_table("entidades")
    op.drop_table("archivos_subidos")
    op.drop_table("sesiones")
    op.drop_table("usuarios")
