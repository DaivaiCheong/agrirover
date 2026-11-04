"""
Domain model for AI Auto Farm.

See docs/SCHEMA.md for what each relation is for. The rover-related relations
(survey_mission, survey_finding, crop_image) exist before the rover is
commissioned, so that commissioning is a hardware task and never a schema migration.
"""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Enum, ForeignKey, Integer,
    Numeric, SmallInteger, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TrialArm(str, enum.Enum):
    guided = "guided"      # the farmer gets the daily message
    usual = "usual"        # watered the usual way; we only record what we WOULD have said


class Role(str, enum.Enum):
    farmer = "farmer"
    admin = "admin"


class DeviceKind(str, enum.Enum):
    pi_core = "pi_core"          # Raspberry Pi — API, database, broker, AI
    field_node = "field_node"    # ESP8266 — sensors + relay bank
    rover = "rover"              # not commissioned


class Metric(str, enum.Enum):
    soil_moisture = "soil_moisture"
    water_ph = "water_ph"
    rain = "rain"
    supply_voltage = "supply_voltage"


class Trigger(str, enum.Enum):
    auto_threshold = "auto_threshold"
    manual_override = "manual_override"
    scheduled = "scheduled"
    vision_target = "vision_target"


class Quality(str, enum.Enum):
    valid = "valid"
    uncalibrated = "uncalibrated"
    suspect = "suspect"


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = _pk()
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role, name="user_role"), default=Role.farmer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    failed_attempts: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Farm(Base):
    __tablename__ = "farm"
    id: Mapped[uuid.UUID] = _pk()
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Phnom_Penh", nullable=False)
    zones: Mapped[list["Zone"]] = relationship(back_populates="farm", cascade="all, delete-orphan")


class CropProfile(Base):
    __tablename__ = "crop_profile"
    id: Mapped[uuid.UUID] = _pk()
    common_name: Mapped[str] = mapped_column(String(80), nullable=False)
    scientific_name: Mapped[str | None] = mapped_column(String(120))
    opt_moisture_min_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    opt_moisture_max_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    growth_duration_days: Mapped[int | None] = mapped_column(Integer)
    # Water coefficients (FAO-56 single Kc). Empty for a crop with no water data yet.
    slug: Mapped[str | None] = mapped_column(String(48), unique=True)
    kc_ini: Mapped[float | None] = mapped_column(Numeric(4, 2))
    kc_mid: Mapped[float | None] = mapped_column(Numeric(4, 2))
    kc_end: Mapped[float | None] = mapped_column(Numeric(4, 2))
    stage_ini_days: Mapped[int | None] = mapped_column(SmallInteger)
    stage_dev_days: Mapped[int | None] = mapped_column(SmallInteger)
    stage_mid_days: Mapped[int | None] = mapped_column(SmallInteger)
    stage_late_days: Mapped[int | None] = mapped_column(SmallInteger)
    kc_source: Mapped[str | None] = mapped_column(Text)


class Zone(Base):
    __tablename__ = "zone"
    __table_args__ = (UniqueConstraint("farm_id", "name", name="uq_zone_name_per_farm"),)
    id: Mapped[uuid.UUID] = _pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farm.id", ondelete="CASCADE"), nullable=False)
    crop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("crop_profile.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(80), nullable=False)          # short id, used in MQTT topics
    label: Mapped[str | None] = mapped_column(String(80))                  # what the farmer reads: "Tomato bed A"
    trial_arm: Mapped[TrialArm | None] = mapped_column(Enum(TrialArm, name="trial_arm"))
    area_m2: Mapped[float | None] = mapped_column(Numeric(8, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    farm: Mapped[Farm] = relationship(back_populates="zones")
    rule: Mapped["IrrigationRule | None"] = relationship(back_populates="zone", uselist=False)


class Device(Base):
    __tablename__ = "device"
    id: Mapped[uuid.UUID] = _pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farm.id", ondelete="CASCADE"), nullable=False)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("zone.id", ondelete="SET NULL"))
    code: Mapped[str] = mapped_column(String(48), unique=True, nullable=False)   # ESP-FIELD-01
    kind: Mapped[DeviceKind] = mapped_column(Enum(DeviceKind, name="device_kind"), nullable=False)
    hardware_uid: Mapped[str | None] = mapped_column(String(64), unique=True)
    credential_hash: Mapped[str | None] = mapped_column(String(255))
    firmware_version: Mapped[str | None] = mapped_column(String(32))
    expected_interval_s: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    commissioned: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Contact(Base):
    """How to reach a person. One farmer today; the table lets more farmers be served later."""
    __tablename__ = "contact"
    __table_args__ = (UniqueConstraint("channel", "address", name="uq_contact_channel_address"),)
    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    channel: Mapped[str] = mapped_column(String(16), default="telegram", nullable=False)
    address: Mapped[str] = mapped_column(String(128), nullable=False)          # Telegram chat id
    language: Mapped[str] = mapped_column(String(2), default="en", nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Planting(Base):
    """What is growing in a zone, and since when. Day 21 of tomato comes from planted_on."""
    __tablename__ = "planting"
    id: Mapped[uuid.UUID] = _pk()
    zone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"), nullable=False)
    crop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("crop_profile.id", ondelete="RESTRICT"), nullable=False)
    variety: Mapped[str | None] = mapped_column(String(80))
    planted_on: Mapped[date] = mapped_column(Date, nullable=False)
    ended_on: Mapped[date | None] = mapped_column(Date)                 # empty while the cycle is open
    plant_count: Mapped[int | None] = mapped_column(Integer)
    area_m2: Mapped[float | None] = mapped_column(Numeric(10, 2))


class Sensor(Base):
    """One probe on a field node. Two depths per zone: a reading says which probe it came from."""
    __tablename__ = "sensor"
    id: Mapped[uuid.UUID] = _pk()
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("device.id", ondelete="CASCADE"), nullable=False)
    zone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"), nullable=False)
    code: Mapped[str] = mapped_column(String(48), unique=True, nullable=False)  # S-A-25
    kind: Mapped[str] = mapped_column(String(24), default="soil_moisture", nullable=False)
    depth_cm: Mapped[int | None] = mapped_column(SmallInteger)
    calibration_dry: Mapped[float | None] = mapped_column(Numeric(8, 3))        # raw value in dry soil
    calibration_wet: Mapped[float | None] = mapped_column(Numeric(8, 3))        # raw value in wet soil
    used_for_decision: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class SensorReading(Base):
    __tablename__ = "sensor_reading"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("device.id", ondelete="CASCADE"), nullable=False)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"))
    sensor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sensor.id", ondelete="SET NULL"))
    metric: Mapped[Metric] = mapped_column(Enum(Metric, name="metric_type"), nullable=False)
    value: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    quality: Mapped[Quality] = mapped_column(Enum(Quality, name="reading_quality"),
                                             default=Quality.valid, nullable=False)
    sample_count: Mapped[int | None] = mapped_column(SmallInteger)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IrrigationRule(Base):
    __tablename__ = "irrigation_rule"
    __table_args__ = (
        CheckConstraint("moisture_threshold_pct BETWEEN 0 AND 100", name="ck_rule_threshold"),
        CheckConstraint("max_duration_ms > 0", name="ck_rule_maxrun"),
    )
    id: Mapped[uuid.UUID] = _pk()
    zone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"),
                                               unique=True, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    moisture_threshold_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=30, nullable=False)
    stop_above_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=45, nullable=False)
    max_duration_ms: Mapped[int] = mapped_column(Integer, default=90_000, nullable=False)
    cooldown_minutes: Mapped[int] = mapped_column(SmallInteger, default=30, nullable=False)
    rain_lockout: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    daylight_only: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)  # 6 V solar pump
    daylight_start_h: Mapped[int] = mapped_column(SmallInteger, default=6, nullable=False)
    daylight_end_h: Mapped[int] = mapped_column(SmallInteger, default=17, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    zone: Mapped[Zone] = relationship(back_populates="rule")


class IrrigationEvent(Base):
    __tablename__ = "irrigation_event"
    __table_args__ = (
        CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="ck_event_order"),
        CheckConstraint("trigger_type <> 'manual_override' OR triggered_by IS NOT NULL",
                        name="ck_manual_attributable"),
    )
    id: Mapped[uuid.UUID] = _pk()
    zone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"), nullable=False)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("device.id", ondelete="RESTRICT"), nullable=False)
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    trigger_type: Mapped[Trigger] = mapped_column(Enum(Trigger, name="trigger_type"), nullable=False)
    channel: Mapped[int] = mapped_column(SmallInteger, default=1, nullable=False)   # relay channel
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    water_volume_ml: Mapped[float | None] = mapped_column(Numeric(9, 2))
    stop_reason: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="running", nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(64))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --------------------------------------------------------------------------
# Reserved for the survey rover. Created now; unused until commissioning.
# --------------------------------------------------------------------------
class SurveyMission(Base):
    __tablename__ = "survey_mission"
    id: Mapped[uuid.UUID] = _pk()
    zone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"), nullable=False)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("device.id", ondelete="CASCADE"), nullable=False)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(16), default="queued", nullable=False)
    cells_scanned: Mapped[int | None] = mapped_column(SmallInteger)
    plants_detected: Mapped[int | None] = mapped_column(SmallInteger)
    plants_needing_water: Mapped[int | None] = mapped_column(SmallInteger)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CropImage(Base):
    __tablename__ = "crop_image"
    id: Mapped[uuid.UUID] = _pk()
    mission_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("survey_mission.id", ondelete="CASCADE"))
    zone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"), nullable=False)
    source: Mapped[str] = mapped_column(String(16), default="upload", nullable=False)  # upload | rover
    storage_uri: Mapped[str] = mapped_column(Text, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DiseaseDetection(Base):
    __tablename__ = "disease_detection"
    __table_args__ = (CheckConstraint("confidence BETWEEN 0 AND 1", name="ck_conf_range"),)
    id: Mapped[uuid.UUID] = _pk()
    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("crop_image.id", ondelete="CASCADE"), nullable=False)
    model_version: Mapped[str] = mapped_column(String(32), nullable=False)
    disease_class: Mapped[str] = mapped_column(String(80), nullable=False)
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --------------------------------------------------------------------------
# AI assistant — human-in-the-loop actuation.
#
# The assistant may read anything and propose anything. It may not energise a
# relay. Every write it wants goes through this relation first, is shown to the
# farmer with its evidence, and only executes once a named person approves it.
# --------------------------------------------------------------------------
class ProposalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    expired = "expired"
    executed = "executed"
    failed = "failed"


class ActionProposal(Base):
    __tablename__ = "action_proposal"
    __table_args__ = (
        CheckConstraint("duration_ms IS NULL OR duration_ms > 0", name="ck_proposal_duration"),
        # An approved proposal must name the person who approved it.
        CheckConstraint("status <> 'approved' OR approved_by IS NOT NULL",
                        name="ck_approval_attributable"),
    )
    id: Mapped[uuid.UUID] = _pk()
    zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"))
    device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("device.id", ondelete="SET NULL"))

    action: Mapped[str] = mapped_column(String(48), nullable=False)      # set_relay
    channel: Mapped[int | None] = mapped_column(SmallInteger)
    target_state: Mapped[str | None] = mapped_column(String(8))          # ON | OFF
    duration_ms: Mapped[int | None] = mapped_column(Integer)

    rationale: Mapped[str] = mapped_column(Text, nullable=False)         # what the model said, verbatim
    evidence: Mapped[str] = mapped_column(Text, nullable=False)          # readings it based this on
    safety_checks: Mapped[str] = mapped_column(Text, nullable=False)     # JSON: which guards passed
    model_version: Mapped[str] = mapped_column(String(48), nullable=False)

    status: Mapped[ProposalStatus] = mapped_column(
        Enum(ProposalStatus, name="proposal_status"), default=ProposalStatus.pending, nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    executed_event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("irrigation_event.id", ondelete="SET NULL"))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DailyDecision(Base):
    """What the rule engine said for one zone on one day, and why. One row per zone per
    day, whatever the outcome, so why-did-it-say-that can always be answered."""
    __tablename__ = "daily_decision"
    __table_args__ = (
        UniqueConstraint("zone_id", "decision_date", name="uq_decision_zone_day"),
        CheckConstraint("done_seconds IS NULL OR done_seconds >= 0", name="ck_done_seconds"),
    )
    id: Mapped[uuid.UUID] = _pk()
    zone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"), nullable=False)
    decision_date: Mapped[date] = mapped_column(Date, nullable=False)           # farm-local day
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    decision: Mapped[str] = mapped_column(String(24), nullable=False)           # rule engine outcome
    reason: Mapped[str] = mapped_column(String(48), nullable=False)
    duration_s: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    inputs: Mapped[str] = mapped_column(Text, nullable=False)                   # JSON: what it looked at
    message_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    proposal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("action_proposal.id", ondelete="SET NULL"))
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))   # farmer reports having watered
    done_seconds: Mapped[int | None] = mapped_column(Integer)


class DiseaseClass(Base):
    """Diseases the model can name. Rows come from the model's labels file; the advice text
    must come from an agronomist."""
    __tablename__ = "disease_class"
    __table_args__ = (UniqueConstraint("crop_id", "code", name="uq_disease_crop_code"),)
    id: Mapped[uuid.UUID] = _pk()
    crop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("crop_profile.id", ondelete="CASCADE"), nullable=False)
    code: Mapped[str] = mapped_column(String(48), nullable=False)
    name_en: Mapped[str] = mapped_column(String(80), nullable=False)
    name_km: Mapped[str | None] = mapped_column(String(80))
    advice: Mapped[str | None] = mapped_column(Text)


class SurveyFinding(Base):
    """One rover cell. Before this, the rover report was logged and then lost."""
    __tablename__ = "survey_finding"
    __table_args__ = (UniqueConstraint("mission_id", "cell_row", "cell_col", name="uq_finding_cell"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    mission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("survey_mission.id", ondelete="CASCADE"), nullable=False)
    cell_row: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    cell_col: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    plant_present: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    needs_water: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    yellowing: Mapped[float | None] = mapped_column(Numeric(4, 3))
    disease_code: Mapped[str | None] = mapped_column(String(48))
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    image_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("crop_image.id", ondelete="SET NULL"))


class FieldObservation(Base):
    """A number a person writes down: minutes spent checking, plants lost, waterlogging, a note.
    The evidence for the guided-versus-usual comparison."""
    __tablename__ = "field_observation"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    zone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"), nullable=False)
    observed_on: Mapped[date] = mapped_column(Date, nullable=False)
    kind: Mapped[str] = mapped_column(String(24), nullable=False)               # labour_minutes | loss_count | waterlogging | note
    value: Mapped[float | None] = mapped_column(Numeric(10, 2))
    note: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


# --------------------------------------------------------------------------
# Management: what a crop cycle costs, and what it yields (cost of production).
# Every table reaches a farm, so adding login later is not a rewrite.
# --------------------------------------------------------------------------
class FarmSetting(Base):
    """One row per farm. Empty (NULL) means "not set": the report then says so instead of guessing."""
    __tablename__ = "farm_setting"
    __table_args__ = (
        CheckConstraint("khr_per_usd > 0", name="ck_setting_rate"),
        CheckConstraint("irrigation_efficiency > 0 AND irrigation_efficiency <= 1", name="ck_setting_eff"),
    )
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farm.id", ondelete="CASCADE"), primary_key=True)
    khr_per_usd: Mapped[float] = mapped_column(Numeric(10, 2), default=4000, nullable=False)
    rate_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)   # 4000 is a placeholder until saved
    family_wage_usd_per_day: Mapped[float | None] = mapped_column(Numeric(8, 2))
    water_cost_per_m3_usd: Mapped[float | None] = mapped_column(Numeric(8, 4))
    land_rent_usd_per_ha_year: Mapped[float | None] = mapped_column(Numeric(10, 2))
    irrigation_efficiency: Mapped[float] = mapped_column(Numeric(3, 2), default=0.90, nullable=False)


class StockItem(Base):
    """An input kept in the shed. Buying it adds stock; using it on a cycle creates the cost."""
    __tablename__ = "stock_item"
    __table_args__ = (UniqueConstraint("farm_id", "name", name="uq_stock_farm_name"),)
    id: Mapped[uuid.UUID] = _pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farm.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    category: Mapped[str] = mapped_column(String(24), nullable=False)          # seed | fertilizer | pesticide | materials
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    qty_on_hand: Mapped[float] = mapped_column(Numeric(14, 3), default=0, nullable=False)
    avg_unit_cost_usd: Mapped[float] = mapped_column(Numeric(14, 4), default=0, nullable=False)   # moving average


class StockMove(Base):
    __tablename__ = "stock_move"
    __table_args__ = (
        CheckConstraint("qty > 0", name="ck_move_qty"),
        CheckConstraint("kind IN ('in', 'out')", name="ck_move_kind"),
    )
    id: Mapped[uuid.UUID] = _pk()
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_item.id", ondelete="CASCADE"), nullable=False)
    move_date: Mapped[date] = mapped_column(Date, nullable=False)
    kind: Mapped[str] = mapped_column(String(3), nullable=False)
    qty: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)
    unit_cost_usd: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    planting_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("planting.id", ondelete="RESTRICT"))
    note: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CostEntry(Base):
    """One line of money spent. The single ledger for the whole farm. An entry with no
    planting_id is a farm-level cost (overhead) and is shared across the cycles active that day."""
    __tablename__ = "cost_entry"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_cost_amount"),
        CheckConstraint("currency IN ('USD', 'KHR')", name="ck_cost_currency"),
    )
    id: Mapped[uuid.UUID] = _pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farm.id", ondelete="CASCADE"), nullable=False)
    planting_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("planting.id", ondelete="RESTRICT"))
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    description: Mapped[str | None] = mapped_column(String(160))
    qty: Mapped[float | None] = mapped_column(Numeric(12, 3))
    unit: Mapped[str | None] = mapped_column(String(16))
    unit_price: Mapped[float | None] = mapped_column(Numeric(14, 4))
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)       # as entered
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    amount_usd: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)   # frozen at the rate of the day
    rate_used: Mapped[float | None] = mapped_column(Numeric(10, 2))             # KHR per USD, when currency is KHR
    source: Mapped[str] = mapped_column(String(16), default="manual", nullable=False)   # manual | stock_use
    stock_move_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stock_move.id", ondelete="SET NULL"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))        # soft delete: nothing is lost
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Asset(Base):
    """Equipment that wears out: pump, drip lines, tank, sensors. Straight-line depreciation."""
    __tablename__ = "asset"
    __table_args__ = (
        CheckConstraint("life_years > 0", name="ck_asset_life"),
        CheckConstraint("cost_usd >= 0 AND salvage_usd >= 0 AND salvage_usd <= cost_usd", name="ck_asset_value"),
    )
    id: Mapped[uuid.UUID] = _pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farm.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    cost_usd: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    bought_on: Mapped[date] = mapped_column(Date, nullable=False)
    life_years: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    salvage_usd: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    retired_on: Mapped[date | None] = mapped_column(Date)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Harvest(Base):
    """What came off the plants. Lost = total - marketable - kept at home."""
    __tablename__ = "harvest"
    __table_args__ = (
        CheckConstraint("kg_total >= 0 AND kg_marketable >= 0 AND kg_home >= 0", name="ck_harvest_nonneg"),
        CheckConstraint("kg_marketable + kg_home <= kg_total", name="ck_harvest_sums"),
    )
    id: Mapped[uuid.UUID] = _pk()
    planting_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("planting.id", ondelete="CASCADE"), nullable=False)
    harvest_date: Mapped[date] = mapped_column(Date, nullable=False)
    kg_total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    kg_marketable: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    kg_home: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    note: Mapped[str | None] = mapped_column(String(160))


class Sale(Base):
    __tablename__ = "sale"
    __table_args__ = (
        CheckConstraint("kg > 0 AND price_per_kg >= 0", name="ck_sale_values"),
        CheckConstraint("currency IN ('USD', 'KHR')", name="ck_sale_currency"),
    )
    id: Mapped[uuid.UUID] = _pk()
    planting_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("planting.id", ondelete="CASCADE"), nullable=False)
    sale_date: Mapped[date] = mapped_column(Date, nullable=False)
    kg: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    price_per_kg: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)     # as entered
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    amount_usd: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)       # kg x price, in USD at the day's rate
    buyer: Mapped[str | None] = mapped_column(String(120))
