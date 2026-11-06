"""Sample finance figures, marked so they can never be taken for real ones

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-05 16:00:00

A demo needs a full Finance page before a farm has real figures. A flag on each row, not a word in its text, is what
lets them be shown as sample and removed without touching a real entry.
"""
from alembic import op
import sqlalchemy as sa


revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None

TABLES = ('cost_entry', 'harvest', 'sale')


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column('sample', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    for table in TABLES:
        op.drop_column(table, 'sample')
