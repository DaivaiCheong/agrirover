"""
Domain model for AI Auto Farm.

Twelve relations. The rover-related relations (survey_mission, crop_image,
vision_analysis) are created now even though the rover is not commissioned, so
that commissioning is a hardware task and never a schema migration.
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


class Zone(Base):
    __tablename__ = "zone"
    __table_args__ = (UniqueConstraint("farm_id", "name", name="uq_zone_name_per_farm"),)
    id: Mapped[uuid.UUID] = _pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farm.id", ondelete="CASCADE"), nullable=False)
    crop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("crop_profile.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(80), nullable=False)
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


class SensorReading(Base):
    __tablename__ = "sensor_reading"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("device.id", ondelete="CASCADE"), nullable=False)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"))
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


class Alert(Base):
    __tablename__ = "alert"
    id: Mapped[uuid.UUID] = _pk()
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farm.id", ondelete="CASCADE"), nullable=False)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"))
    alert_type: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), default="warning", nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


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


class GrowthRecord(Base):
    __tablename__ = "growth_record"
    __table_args__ = (UniqueConstraint("zone_id", "recorded_on", name="uq_growth_zone_day"),)
    id: Mapped[uuid.UUID] = _pk()
    zone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("zone.id", ondelete="CASCADE"), nullable=False)
    recorded_on: Mapped[date] = mapped_column(Date, nullable=False)
    canopy_coverage_pct: Mapped[float | None] = mapped_column(Numeric(5, 2))
    plant_count: Mapped[int | None] = mapped_column(SmallInteger)


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
