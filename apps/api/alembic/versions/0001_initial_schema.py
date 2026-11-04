"""initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-11-04 15:22:49.563532
"""
from alembic import op
import sqlalchemy as sa


revision = '0001'
down_revision = None
branch_labels = None
depends_on = None

ENUM_TYPES = ('user_role', 'device_kind', 'metric_type', 'reading_quality',
              'trigger_type', 'proposal_status')


def upgrade() -> None:
    op.create_table('crop_profile',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('common_name', sa.String(length=80), nullable=False),
    sa.Column('scientific_name', sa.String(length=120), nullable=True),
    sa.Column('opt_moisture_min_pct', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('opt_moisture_max_pct', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('growth_duration_days', sa.Integer(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('full_name', sa.String(length=120), nullable=False),
    sa.Column('role', sa.Enum('farmer', 'admin', name='user_role'), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('failed_attempts', sa.SmallInteger(), nullable=False),
    sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('audit_log',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('action', sa.String(length=64), nullable=False),
    sa.Column('entity_type', sa.String(length=64), nullable=True),
    sa.Column('entity_id', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('farm',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('owner_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('location', sa.String(length=255), nullable=True),
    sa.Column('timezone', sa.String(length=64), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('zone',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('farm_id', sa.UUID(), nullable=False),
    sa.Column('crop_id', sa.UUID(), nullable=True),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('area_m2', sa.Numeric(precision=8, scale=2), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['crop_id'], ['crop_profile.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['farm_id'], ['farm.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('farm_id', 'name', name='uq_zone_name_per_farm')
    )
    op.create_table('alert',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('farm_id', sa.UUID(), nullable=False),
    sa.Column('zone_id', sa.UUID(), nullable=True),
    sa.Column('alert_type', sa.String(length=40), nullable=False),
    sa.Column('severity', sa.String(length=16), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('is_read', sa.Boolean(), nullable=False),
    sa.Column('acknowledged_by', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['acknowledged_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['farm_id'], ['farm.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('device',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('farm_id', sa.UUID(), nullable=False),
    sa.Column('zone_id', sa.UUID(), nullable=True),
    sa.Column('code', sa.String(length=48), nullable=False),
    sa.Column('kind', sa.Enum('pi_core', 'field_node', 'rover', name='device_kind'), nullable=False),
    sa.Column('hardware_uid', sa.String(length=64), nullable=True),
    sa.Column('credential_hash', sa.String(length=255), nullable=True),
    sa.Column('firmware_version', sa.String(length=32), nullable=True),
    sa.Column('expected_interval_s', sa.Integer(), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('commissioned', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['farm_id'], ['farm.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code'),
    sa.UniqueConstraint('hardware_uid')
    )
    op.create_table('growth_record',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('zone_id', sa.UUID(), nullable=False),
    sa.Column('recorded_on', sa.Date(), nullable=False),
    sa.Column('canopy_coverage_pct', sa.Numeric(precision=5, scale=2), nullable=True),
    sa.Column('plant_count', sa.SmallInteger(), nullable=True),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('zone_id', 'recorded_on', name='uq_growth_zone_day')
    )
    op.create_table('irrigation_rule',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('zone_id', sa.UUID(), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('moisture_threshold_pct', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('stop_above_pct', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('max_duration_ms', sa.Integer(), nullable=False),
    sa.Column('cooldown_minutes', sa.SmallInteger(), nullable=False),
    sa.Column('rain_lockout', sa.Boolean(), nullable=False),
    sa.Column('daylight_only', sa.Boolean(), nullable=False),
    sa.Column('daylight_start_h', sa.SmallInteger(), nullable=False),
    sa.Column('daylight_end_h', sa.SmallInteger(), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.CheckConstraint('max_duration_ms > 0', name='ck_rule_maxrun'),
    sa.CheckConstraint('moisture_threshold_pct BETWEEN 0 AND 100', name='ck_rule_threshold'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('zone_id')
    )
    op.create_table('irrigation_event',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('zone_id', sa.UUID(), nullable=False),
    sa.Column('device_id', sa.UUID(), nullable=False),
    sa.Column('triggered_by', sa.UUID(), nullable=True),
    sa.Column('trigger_type', sa.Enum('auto_threshold', 'manual_override', 'scheduled', 'vision_target', name='trigger_type'), nullable=False),
    sa.Column('channel', sa.SmallInteger(), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('duration_ms', sa.Integer(), nullable=True),
    sa.Column('water_volume_ml', sa.Numeric(precision=9, scale=2), nullable=True),
    sa.Column('stop_reason', sa.String(length=32), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.CheckConstraint("trigger_type <> 'manual_override' OR triggered_by IS NOT NULL", name='ck_manual_attributable'),
    sa.CheckConstraint('ended_at IS NULL OR ended_at >= started_at', name='ck_event_order'),
    sa.ForeignKeyConstraint(['device_id'], ['device.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['triggered_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('sensor_reading',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('device_id', sa.UUID(), nullable=False),
    sa.Column('zone_id', sa.UUID(), nullable=True),
    sa.Column('metric', sa.Enum('soil_moisture', 'water_ph', 'rain', 'supply_voltage', name='metric_type'), nullable=False),
    sa.Column('value', sa.Numeric(precision=10, scale=3), nullable=False),
    sa.Column('unit', sa.String(length=16), nullable=False),
    sa.Column('quality', sa.Enum('valid', 'uncalibrated', 'suspect', name='reading_quality'), nullable=False),
    sa.Column('sample_count', sa.SmallInteger(), nullable=True),
    sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('received_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['device_id'], ['device.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sensor_reading_recorded_at'), 'sensor_reading', ['recorded_at'], unique=False)
    op.create_table('survey_mission',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('zone_id', sa.UUID(), nullable=False),
    sa.Column('device_id', sa.UUID(), nullable=False),
    sa.Column('requested_by', sa.UUID(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('cells_scanned', sa.SmallInteger(), nullable=True),
    sa.Column('plants_detected', sa.SmallInteger(), nullable=True),
    sa.Column('plants_needing_water', sa.SmallInteger(), nullable=True),
    sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['device_id'], ['device.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['requested_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('action_proposal',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('zone_id', sa.UUID(), nullable=True),
    sa.Column('device_id', sa.UUID(), nullable=True),
    sa.Column('action', sa.String(length=48), nullable=False),
    sa.Column('channel', sa.SmallInteger(), nullable=True),
    sa.Column('target_state', sa.String(length=8), nullable=True),
    sa.Column('duration_ms', sa.Integer(), nullable=True),
    sa.Column('rationale', sa.Text(), nullable=False),
    sa.Column('evidence', sa.Text(), nullable=False),
    sa.Column('safety_checks', sa.Text(), nullable=False),
    sa.Column('model_version', sa.String(length=48), nullable=False),
    sa.Column('status', sa.Enum('pending', 'approved', 'rejected', 'expired', 'executed', 'failed', name='proposal_status'), nullable=False),
    sa.Column('approved_by', sa.UUID(), nullable=True),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('executed_event_id', sa.UUID(), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status <> 'approved' OR approved_by IS NOT NULL", name='ck_approval_attributable'),
    sa.CheckConstraint('duration_ms IS NULL OR duration_ms > 0', name='ck_proposal_duration'),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['device_id'], ['device.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['executed_event_id'], ['irrigation_event.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('crop_image',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('mission_id', sa.UUID(), nullable=True),
    sa.Column('zone_id', sa.UUID(), nullable=False),
    sa.Column('source', sa.String(length=16), nullable=False),
    sa.Column('storage_uri', sa.Text(), nullable=False),
    sa.Column('captured_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['mission_id'], ['survey_mission.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['zone_id'], ['zone.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('disease_detection',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('image_id', sa.UUID(), nullable=False),
    sa.Column('model_version', sa.String(length=32), nullable=False),
    sa.Column('disease_class', sa.String(length=80), nullable=False),
    sa.Column('confidence', sa.Numeric(precision=4, scale=3), nullable=False),
    sa.Column('is_confirmed', sa.Boolean(), nullable=False),
    sa.Column('confirmed_by', sa.UUID(), nullable=True),
    sa.Column('detected_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('confidence BETWEEN 0 AND 1', name='ck_conf_range'),
    sa.ForeignKeyConstraint(['confirmed_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['image_id'], ['crop_image.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('disease_detection')
    op.drop_table('crop_image')
    op.drop_table('action_proposal')
    op.drop_table('survey_mission')
    op.drop_index(op.f('ix_sensor_reading_recorded_at'), table_name='sensor_reading')
    op.drop_table('sensor_reading')
    op.drop_table('irrigation_event')
    op.drop_table('irrigation_rule')
    op.drop_table('growth_record')
    op.drop_table('device')
    op.drop_table('alert')
    op.drop_table('zone')
    op.drop_table('farm')
    op.drop_table('audit_log')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_table('crop_profile')
    # Postgres enum types are not dropped with their tables.
    for name in ENUM_TYPES:
        op.execute(f'DROP TYPE IF EXISTS {name}')
