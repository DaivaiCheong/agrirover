"""drop the single ET0 setting: plans now use Siem Reap's monthly ET0 (services/climate.py)

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-04 18:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint('ck_setting_et0', 'farm_setting', type_='check')
    op.drop_column('farm_setting', 'et0_mm_day')


def downgrade() -> None:
    op.add_column('farm_setting', sa.Column('et0_mm_day', sa.Numeric(precision=4, scale=1), nullable=False,
                                            server_default='4.5'))
    op.alter_column('farm_setting', 'et0_mm_day', server_default=None)
    op.create_check_constraint('ck_setting_et0', 'farm_setting', 'et0_mm_day > 0')
