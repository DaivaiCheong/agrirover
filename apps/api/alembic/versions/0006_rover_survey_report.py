"""Keep the rover's survey report: grid, how it ended, and each cell's readings

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-05 09:00:00

The rover's report was logged and then lost. A survey row now holds its grid and why it stopped, and says
whether a simulated rover produced it, so generated data can never be mistaken for a field result.
Only columns are added; the two tables were empty on the demo. Downgrade drops these columns.
"""
from alembic import op
import sqlalchemy as sa


revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('survey_mission', sa.Column('rows', sa.SmallInteger(), nullable=True))
    op.add_column('survey_mission', sa.Column('cols', sa.SmallInteger(), nullable=True))
    op.add_column('survey_mission', sa.Column('cell_m', sa.Numeric(4, 2), nullable=True))
    op.add_column('survey_mission', sa.Column('abort_reason', sa.String(48), nullable=True))
    op.add_column('survey_mission', sa.Column('cells_flagged', sa.SmallInteger(), nullable=True))
    op.add_column('survey_mission', sa.Column('distance_m', sa.Numeric(8, 2), nullable=True))
    op.add_column('survey_mission', sa.Column('est_duration_s', sa.Numeric(8, 1), nullable=True))
    op.add_column('survey_mission', sa.Column('simulated', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column('survey_finding', sa.Column('canopy', sa.Numeric(5, 4), nullable=True))
    op.add_column('survey_finding', sa.Column('dryness', sa.Numeric(4, 3), nullable=True))
    op.add_column('survey_finding', sa.Column('suggested_ml', sa.Integer(), nullable=True))
    op.add_column('survey_finding', sa.Column('flagged', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    for column in ('flagged', 'suggested_ml', 'dryness', 'canopy'):
        op.drop_column('survey_finding', column)
    for column in ('simulated', 'est_duration_s', 'distance_m', 'cells_flagged', 'abort_reason', 'cell_m', 'cols', 'rows'):
        op.drop_column('survey_mission', column)
