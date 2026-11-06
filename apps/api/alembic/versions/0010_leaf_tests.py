"""Leaf samples and what the lab said about them

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-06 14:00:00

The first record of a nutrient in a leaf. Soil N, P and K in sensor_reading are a different thing and stay apart.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'leaf_sample',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('zone_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('planting_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('variety', sa.String(length=80), nullable=True),
        sa.Column('taken_on', sa.Date(), nullable=False),
        sa.Column('crop_day', sa.Integer(), nullable=False),
        sa.Column('tree_row', sa.SmallInteger(), nullable=True),
        sa.Column('tree_col', sa.SmallInteger(), nullable=True),
        sa.Column('leaf_pairs', sa.SmallInteger(), nullable=False),
        sa.Column('collected_by', sa.String(length=80), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('lab', sa.String(length=120), nullable=True),
        sa.Column('results_on', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['planting_id'], ['planting.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'leaf_result',
        sa.Column('sample_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('nutrient', sa.String(length=4), nullable=False),
        sa.Column('source', sa.String(length=8), server_default='lab', nullable=False),
        sa.Column('value', sa.Numeric(precision=12, scale=4), nullable=False),
        sa.Column('unit', sa.String(length=8), nullable=False),
        sa.ForeignKeyConstraint(['sample_id'], ['leaf_sample.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('sample_id', 'nutrient', 'source'),
    )


def downgrade() -> None:
    op.drop_table('leaf_result')
    op.drop_table('leaf_sample')
