"""Saved plant photos and who confirmed what they show

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-05 15:00:00

The photo itself is a file; this keeps what it shows. Only an expert's label can train or test a model, so the
farmer's guess, the model's answer and the expert's confirmation are kept apart.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'plant_photo',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('zone_id', sa.UUID(), nullable=True),
        sa.Column('planting_id', sa.UUID(), nullable=True),
        sa.Column('crop_day', sa.Integer(), nullable=True),
        sa.Column('tree_row', sa.SmallInteger(), nullable=True),
        sa.Column('tree_col', sa.SmallInteger(), nullable=True),
        sa.Column('part', sa.String(8), nullable=False),
        sa.Column('filename', sa.String(64), nullable=False),
        sa.Column('taken_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('readings', postgresql.JSONB(), nullable=True),
        sa.Column('model_name', sa.String(48), nullable=True),
        sa.Column('model_label', sa.String(32), nullable=True),
        sa.Column('model_seen', sa.Text(), nullable=True),
        sa.Column('farmer_label', sa.String(32), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('expert_label', sa.String(32), nullable=True),
        sa.Column('expert_name', sa.String(80), nullable=True),
        sa.Column('expert_note', sa.Text(), nullable=True),
        sa.Column('expert_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['planting_id'], ['planting.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('plant_photo')
