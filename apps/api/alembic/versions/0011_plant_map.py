"""Plant map: where the plants stand in a block, for the rover

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-27 12:00:00

A grid of spots for each block and the spots that hold a plant. The rover stops at those only. First used by the
tomato demo block.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'plant_map',
        sa.Column('zone_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('crop', sa.String(length=40), nullable=False),
        sa.Column('rows', sa.SmallInteger(), nullable=False),
        sa.Column('cols', sa.SmallInteger(), nullable=False),
        sa.Column('row_m', sa.Numeric(precision=4, scale=2), nullable=False),
        sa.Column('plant_m', sa.Numeric(precision=4, scale=2), nullable=False),
        sa.Column('plants', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('rows BETWEEN 1 AND 40 AND cols BETWEEN 1 AND 40', name='ck_plant_map_size'),
        sa.CheckConstraint('row_m BETWEEN 0.2 AND 10 AND plant_m BETWEEN 0.2 AND 10', name='ck_plant_map_spacing'),
        sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('zone_id'),
    )


def downgrade() -> None:
    op.drop_table('plant_map')
