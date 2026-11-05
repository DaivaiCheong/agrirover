"""Guava as the farm's crop, and the rover's daily round tree by tree

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-05 12:00:00

A planting now knows when its trees went in (a cycle restarts, the trees do not) and how the cycle was started.
Tasks ticked off are kept. Each tree of a round keeps the probe's and air sensor's readings. Yesterday's
dryness and suggested_ml columns go: soil moisture now comes from the probe and water from the server, not a photo.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('planting', sa.Column('trees_planted_on', sa.Date(), nullable=True))
    op.add_column('planting', sa.Column('regulation', sa.String(16), nullable=True))
    op.add_column('planting', sa.Column('fruit_mm', sa.Numeric(5, 1), nullable=True))
    op.create_table(
        'orchard_job_done',
        sa.Column('planting_id', sa.UUID(), nullable=False),
        sa.Column('job_id', sa.String(24), nullable=False),
        sa.Column('done_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['planting_id'], ['planting.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('planting_id', 'job_id'),
    )
    op.add_column('survey_finding', sa.Column('readings', postgresql.JSONB(), nullable=True))
    op.drop_column('survey_finding', 'dryness')
    op.drop_column('survey_finding', 'suggested_ml')


def downgrade() -> None:
    op.add_column('survey_finding', sa.Column('suggested_ml', sa.Integer(), nullable=True))
    op.add_column('survey_finding', sa.Column('dryness', sa.Numeric(4, 3), nullable=True))
    op.drop_column('survey_finding', 'readings')
    op.drop_table('orchard_job_done')
    op.drop_column('planting', 'fruit_mm')
    op.drop_column('planting', 'regulation')
    op.drop_column('planting', 'trees_planted_on')
