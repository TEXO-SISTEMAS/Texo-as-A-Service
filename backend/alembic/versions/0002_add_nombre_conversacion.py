"""add nombre conversacion

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-13

"""
from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='conversaciones' AND column_name='nombre'"
    ))
    if not result.fetchone():
        op.add_column('conversaciones', sa.Column('nombre', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('conversaciones', 'nombre')
