"""management

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-04 17:06:31.300695
"""
from alembic import op
import sqlalchemy as sa


revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('asset',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('farm_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('cost_usd', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('bought_on', sa.Date(), nullable=False),
    sa.Column('life_years', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('salvage_usd', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('retired_on', sa.Date(), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint('cost_usd >= 0 AND salvage_usd >= 0 AND salvage_usd <= cost_usd', name='ck_asset_value'),
    sa.CheckConstraint('life_years > 0', name='ck_asset_life'),
    sa.ForeignKeyConstraint(['farm_id'], ['farm.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('farm_setting',
    sa.Column('farm_id', sa.UUID(), nullable=False),
    sa.Column('khr_per_usd', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('rate_confirmed', sa.Boolean(), nullable=False),
    sa.Column('family_wage_usd_per_day', sa.Numeric(precision=8, scale=2), nullable=True),
    sa.Column('water_cost_per_m3_usd', sa.Numeric(precision=8, scale=4), nullable=True),
    sa.Column('land_rent_usd_per_ha_year', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('et0_mm_day', sa.Numeric(precision=4, scale=1), nullable=False),
    sa.Column('irrigation_efficiency', sa.Numeric(precision=3, scale=2), nullable=False),
    sa.CheckConstraint('et0_mm_day > 0', name='ck_setting_et0'),
    sa.CheckConstraint('irrigation_efficiency > 0 AND irrigation_efficiency <= 1', name='ck_setting_eff'),
    sa.CheckConstraint('khr_per_usd > 0', name='ck_setting_rate'),
    sa.ForeignKeyConstraint(['farm_id'], ['farm.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('farm_id')
    )
    op.create_table('stock_item',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('farm_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('category', sa.String(length=24), nullable=False),
    sa.Column('unit', sa.String(length=16), nullable=False),
    sa.Column('qty_on_hand', sa.Numeric(precision=14, scale=3), nullable=False),
    sa.Column('avg_unit_cost_usd', sa.Numeric(precision=14, scale=4), nullable=False),
    sa.ForeignKeyConstraint(['farm_id'], ['farm.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('farm_id', 'name', name='uq_stock_farm_name')
    )
    op.create_table('harvest',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('planting_id', sa.UUID(), nullable=False),
    sa.Column('harvest_date', sa.Date(), nullable=False),
    sa.Column('kg_total', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('kg_marketable', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('kg_home', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('note', sa.String(length=160), nullable=True),
    sa.CheckConstraint('kg_marketable + kg_home <= kg_total', name='ck_harvest_sums'),
    sa.CheckConstraint('kg_total >= 0 AND kg_marketable >= 0 AND kg_home >= 0', name='ck_harvest_nonneg'),
    sa.ForeignKeyConstraint(['planting_id'], ['planting.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('sale',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('planting_id', sa.UUID(), nullable=False),
    sa.Column('sale_date', sa.Date(), nullable=False),
    sa.Column('kg', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('price_per_kg', sa.Numeric(precision=14, scale=4), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('amount_usd', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('buyer', sa.String(length=120), nullable=True),
    sa.CheckConstraint("currency IN ('USD', 'KHR')", name='ck_sale_currency'),
    sa.CheckConstraint('kg > 0 AND price_per_kg >= 0', name='ck_sale_values'),
    sa.ForeignKeyConstraint(['planting_id'], ['planting.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('stock_move',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('item_id', sa.UUID(), nullable=False),
    sa.Column('move_date', sa.Date(), nullable=False),
    sa.Column('kind', sa.String(length=3), nullable=False),
    sa.Column('qty', sa.Numeric(precision=14, scale=3), nullable=False),
    sa.Column('unit_cost_usd', sa.Numeric(precision=14, scale=4), nullable=False),
    sa.Column('planting_id', sa.UUID(), nullable=True),
    sa.Column('note', sa.String(length=160), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("kind IN ('in', 'out')", name='ck_move_kind'),
    sa.CheckConstraint('qty > 0', name='ck_move_qty'),
    sa.ForeignKeyConstraint(['item_id'], ['stock_item.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['planting_id'], ['planting.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('cost_entry',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('farm_id', sa.UUID(), nullable=False),
    sa.Column('planting_id', sa.UUID(), nullable=True),
    sa.Column('entry_date', sa.Date(), nullable=False),
    sa.Column('category', sa.String(length=24), nullable=False),
    sa.Column('description', sa.String(length=160), nullable=True),
    sa.Column('qty', sa.Numeric(precision=12, scale=3), nullable=True),
    sa.Column('unit', sa.String(length=16), nullable=True),
    sa.Column('unit_price', sa.Numeric(precision=14, scale=4), nullable=True),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('amount_usd', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('rate_used', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('source', sa.String(length=16), nullable=False),
    sa.Column('stock_move_id', sa.UUID(), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("currency IN ('USD', 'KHR')", name='ck_cost_currency'),
    sa.CheckConstraint('amount >= 0', name='ck_cost_amount'),
    sa.ForeignKeyConstraint(['farm_id'], ['farm.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['planting_id'], ['planting.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['stock_move_id'], ['stock_move.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.add_column('crop_profile', sa.Column('slug', sa.String(length=48), nullable=True))
    op.add_column('crop_profile', sa.Column('kc_ini', sa.Numeric(precision=4, scale=2), nullable=True))
    op.add_column('crop_profile', sa.Column('kc_mid', sa.Numeric(precision=4, scale=2), nullable=True))
    op.add_column('crop_profile', sa.Column('kc_end', sa.Numeric(precision=4, scale=2), nullable=True))
    op.add_column('crop_profile', sa.Column('stage_ini_days', sa.SmallInteger(), nullable=True))
    op.add_column('crop_profile', sa.Column('stage_dev_days', sa.SmallInteger(), nullable=True))
    op.add_column('crop_profile', sa.Column('stage_mid_days', sa.SmallInteger(), nullable=True))
    op.add_column('crop_profile', sa.Column('stage_late_days', sa.SmallInteger(), nullable=True))
    op.add_column('crop_profile', sa.Column('kc_source', sa.Text(), nullable=True))
    op.create_unique_constraint('crop_profile_slug_key', 'crop_profile', ['slug'])
    op.add_column('planting', sa.Column('plant_count', sa.Integer(), nullable=True))
    op.add_column('planting', sa.Column('area_m2', sa.Numeric(precision=10, scale=2), nullable=True))


def downgrade() -> None:
    op.drop_column('planting', 'area_m2')
    op.drop_column('planting', 'plant_count')
    op.drop_constraint('crop_profile_slug_key', 'crop_profile', type_='unique')
    op.drop_column('crop_profile', 'kc_source')
    op.drop_column('crop_profile', 'stage_late_days')
    op.drop_column('crop_profile', 'stage_mid_days')
    op.drop_column('crop_profile', 'stage_dev_days')
    op.drop_column('crop_profile', 'stage_ini_days')
    op.drop_column('crop_profile', 'kc_end')
    op.drop_column('crop_profile', 'kc_mid')
    op.drop_column('crop_profile', 'kc_ini')
    op.drop_column('crop_profile', 'slug')
    op.drop_table('cost_entry')
    op.drop_table('stock_move')
    op.drop_table('sale')
    op.drop_table('harvest')
    op.drop_table('stock_item')
    op.drop_table('farm_setting')
    op.drop_table('asset')
