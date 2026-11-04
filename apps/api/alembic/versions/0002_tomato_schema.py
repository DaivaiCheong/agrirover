"""tomato schema: planting, sensors, daily decisions

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-04 16:35:49.360240
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Postgres enum types are not created by add_column, so create it first.
    postgresql.ENUM('guided', 'usual', name='trial_arm').create(op.get_bind(), checkfirst=True)
    op.create_table('contact',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('channel', sa.String(length=16), nullable=False),
    sa.Column('address', sa.String(length=128), nullable=False),
    sa.Column('language', sa.String(length=2), nullable=False),
    sa.Column('verified', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('channel', 'address', name='uq_contact_channel_address')
    )
    op.create_table('disease_class',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('crop_id', sa.UUID(), nullable=False),
    sa.Column('code', sa.String(length=48), nullable=False),
    sa.Column('name_en', sa.String(length=80), nullable=False),
    sa.Column('name_km', sa.String(length=80), nullable=True),
    sa.Column('advice', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['crop_id'], ['crop_profile.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('crop_id', 'code', name='uq_disease_crop_code')
    )
    op.create_table('field_observation',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('zone_id', sa.UUID(), nullable=False),
    sa.Column('observed_on', sa.Date(), nullable=False),
    sa.Column('kind', sa.String(length=24), nullable=False),
    sa.Column('value', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('recorded_by', sa.UUID(), nullable=True),
    sa.ForeignKeyConstraint(['recorded_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('planting',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('zone_id', sa.UUID(), nullable=False),
    sa.Column('crop_id', sa.UUID(), nullable=False),
    sa.Column('variety', sa.String(length=80), nullable=True),
    sa.Column('planted_on', sa.Date(), nullable=False),
    sa.Column('ended_on', sa.Date(), nullable=True),
    sa.ForeignKeyConstraint(['crop_id'], ['crop_profile.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('sensor',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('device_id', sa.UUID(), nullable=False),
    sa.Column('zone_id', sa.UUID(), nullable=False),
    sa.Column('code', sa.String(length=48), nullable=False),
    sa.Column('kind', sa.String(length=24), nullable=False),
    sa.Column('depth_cm', sa.SmallInteger(), nullable=True),
    sa.Column('calibration_dry', sa.Numeric(precision=8, scale=3), nullable=True),
    sa.Column('calibration_wet', sa.Numeric(precision=8, scale=3), nullable=True),
    sa.Column('used_for_decision', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['device_id'], ['device.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_table('daily_decision',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('zone_id', sa.UUID(), nullable=False),
    sa.Column('decision_date', sa.Date(), nullable=False),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('decision', sa.String(length=24), nullable=False),
    sa.Column('reason', sa.String(length=48), nullable=False),
    sa.Column('duration_s', sa.Integer(), nullable=False),
    sa.Column('inputs', sa.Text(), nullable=False),
    sa.Column('message_sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('proposal_id', sa.UUID(), nullable=True),
    sa.Column('done_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('done_seconds', sa.Integer(), nullable=True),
    sa.CheckConstraint('done_seconds IS NULL OR done_seconds >= 0', name='ck_done_seconds'),
    sa.ForeignKeyConstraint(['proposal_id'], ['action_proposal.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('zone_id', 'decision_date', name='uq_decision_zone_day')
    )
    op.create_table('survey_finding',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('mission_id', sa.UUID(), nullable=False),
    sa.Column('cell_row', sa.SmallInteger(), nullable=False),
    sa.Column('cell_col', sa.SmallInteger(), nullable=False),
    sa.Column('plant_present', sa.Boolean(), nullable=False),
    sa.Column('needs_water', sa.Boolean(), nullable=False),
    sa.Column('yellowing', sa.Numeric(precision=4, scale=3), nullable=True),
    sa.Column('disease_code', sa.String(length=48), nullable=True),
    sa.Column('confidence', sa.Numeric(precision=4, scale=3), nullable=True),
    sa.Column('image_id', sa.UUID(), nullable=True),
    sa.ForeignKeyConstraint(['image_id'], ['crop_image.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['mission_id'], ['survey_mission.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('mission_id', 'cell_row', 'cell_col', name='uq_finding_cell')
    )
    op.drop_table('alert')
    op.drop_table('growth_record')
    op.add_column('sensor_reading', sa.Column('sensor_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_sensor_reading_sensor', 'sensor_reading', 'sensor', ['sensor_id'], ['id'], ondelete='SET NULL')
    op.add_column('zone', sa.Column('label', sa.String(length=80), nullable=True))
    op.add_column('zone', sa.Column('trial_arm', postgresql.ENUM('guided', 'usual', name='trial_arm', create_type=False), nullable=True))


def downgrade() -> None:
    op.drop_column('zone', 'trial_arm')
    op.drop_column('zone', 'label')
    op.drop_constraint('fk_sensor_reading_sensor', 'sensor_reading', type_='foreignkey')
    op.drop_column('sensor_reading', 'sensor_id')
    op.create_table('growth_record',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('zone_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('recorded_on', sa.DATE(), autoincrement=False, nullable=False),
    sa.Column('canopy_coverage_pct', sa.NUMERIC(precision=5, scale=2), autoincrement=False, nullable=True),
    sa.Column('plant_count', sa.SMALLINT(), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], name='growth_record_zone_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='growth_record_pkey'),
    sa.UniqueConstraint('zone_id', 'recorded_on', name='uq_growth_zone_day')
    )
    op.create_table('alert',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('farm_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('zone_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('alert_type', sa.VARCHAR(length=40), autoincrement=False, nullable=False),
    sa.Column('severity', sa.VARCHAR(length=16), autoincrement=False, nullable=False),
    sa.Column('message', sa.TEXT(), autoincrement=False, nullable=False),
    sa.Column('is_read', sa.BOOLEAN(), autoincrement=False, nullable=False),
    sa.Column('acknowledged_by', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['acknowledged_by'], ['users.id'], name='alert_acknowledged_by_fkey', ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['farm_id'], ['farm.id'], name='alert_farm_id_fkey', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], name='alert_zone_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='alert_pkey')
    )
    op.drop_table('survey_finding')
    op.drop_table('daily_decision')
    op.drop_table('sensor')
    op.drop_table('planting')
    op.drop_table('field_observation')
    op.drop_table('disease_class')
    op.drop_table('contact')
    op.execute('DROP TYPE IF EXISTS trial_arm')
