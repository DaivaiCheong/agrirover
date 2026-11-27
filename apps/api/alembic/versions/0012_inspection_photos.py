"""Plant Inspection: a rover photo knows its round, and the model's next closest match

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-27 15:00:00

plant_photo.mission_id ties the photos the rover took on a round to that round, so the farm sees one inspection
report. No foreign key: the photo is saved while the round runs, before the round's report is stored.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('plant_photo', sa.Column('model_also', sa.String(length=32), nullable=True))
    op.add_column('plant_photo', sa.Column('mission_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index('ix_plant_photo_mission_id', 'plant_photo', ['mission_id'])


def downgrade() -> None:
    op.drop_index('ix_plant_photo_mission_id', table_name='plant_photo')
    op.drop_column('plant_photo', 'mission_id')
    op.drop_column('plant_photo', 'model_also')
