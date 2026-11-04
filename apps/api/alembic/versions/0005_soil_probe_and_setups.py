"""7-in-1 soil probe + air sensor metrics, history index, growing setup on a planting

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-04 20:00:00

The plain recorded_at index is dropped: the new (zone, metric, recorded_at) index replaces it, and while both
exist Postgres prefers the plain one for "newest reading of this metric in this bed" and scans the whole
table backwards when the bed has no such reading (4.7 s for one lookup at 1.4 million rows). Without it the
same lookup is an index probe (the Today page went from 5 s to under 20 ms).

Downgrade note: Postgres cannot remove a value from an enum, so the downgrade rebuilds metric_type
and DELETES every reading of the eight new metrics (soil pH, EC, temperature, N, P, K, air
temperature, air humidity). Nothing else is lost.
"""
from alembic import op
import sqlalchemy as sa


revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None

NEW_METRICS = ('soil_ph', 'soil_ec', 'soil_temperature', 'nitrogen', 'phosphorus', 'potassium',
               'air_temperature', 'air_humidity')
OLD_METRICS = ('soil_moisture', 'water_ph', 'rain', 'supply_voltage')


def upgrade() -> None:
    # A new enum value cannot be used in the transaction that adds it, so add them outside one.
    with op.get_context().autocommit_block():
        for m in NEW_METRICS:
            op.execute(f"ALTER TYPE metric_type ADD VALUE IF NOT EXISTS '{m}'")
    op.create_index('ix_sensor_reading_zone_metric_time', 'sensor_reading', ['zone_id', 'metric', 'recorded_at'])
    op.drop_index(op.f('ix_sensor_reading_recorded_at'), table_name='sensor_reading')
    op.add_column('planting', sa.Column('setup', sa.String(length=24), nullable=True))
    op.add_column('planting', sa.Column('expected_price_usd_per_kg', sa.Numeric(precision=10, scale=4), nullable=True))
    op.create_check_constraint('ck_planting_price', 'planting',
                               'expected_price_usd_per_kg IS NULL OR expected_price_usd_per_kg >= 0')


def downgrade() -> None:
    op.drop_constraint('ck_planting_price', 'planting', type_='check')
    op.drop_column('planting', 'expected_price_usd_per_kg')
    op.drop_column('planting', 'setup')
    op.drop_index('ix_sensor_reading_zone_metric_time', table_name='sensor_reading')
    op.create_index(op.f('ix_sensor_reading_recorded_at'), 'sensor_reading', ['recorded_at'], unique=False)
    gone = ", ".join(f"'{m}'" for m in NEW_METRICS)
    keep = ", ".join(f"'{m}'" for m in OLD_METRICS)
    op.execute(f"DELETE FROM sensor_reading WHERE metric::text IN ({gone})")
    op.execute("ALTER TYPE metric_type RENAME TO metric_type_old")
    op.execute(f"CREATE TYPE metric_type AS ENUM ({keep})")
    op.execute("ALTER TABLE sensor_reading ALTER COLUMN metric TYPE metric_type USING metric::text::metric_type")
    op.execute("DROP TYPE metric_type_old")
