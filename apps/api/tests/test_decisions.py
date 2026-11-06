"""S4: per-zone decisions from stored telemetry, served at /api/v1/decisions/today.

Pure tests need no database. The integration tests run on a throwaway Postgres
database and are skipped when none is reachable (CI provides one)."""
import asyncio
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pgdb
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base, get_db
from app.main import app
from app.models.entities import IrrigationRule
from app.routers import decisions as decisions_router
from app.services import decisions as svc
from app.services.rule_engine import Decision, RuleConfig
from app.services.seed import seed_stage1
from app.workers.mqtt_ingest import store_telemetry

LOCAL = ZoneInfo("Asia/Phnom_Penh")
AT_6 = datetime(2026, 11, 4, 6, 0, tzinfo=LOCAL).astimezone(timezone.utc)   # decision time
AT_22 = datetime(2026, 11, 4, 22, 0, tzinfo=LOCAL).astimezone(timezone.utc)
CFG = RuleConfig()                                                           # threshold 30 %


# ---------------------------------------------------------------- pure logic

def test_decision_instant_is_0600_farm_local():
    now = datetime(2026, 11, 4, 15, 30, tzinfo=LOCAL).astimezone(timezone.utc)
    assert svc.decision_instant("Asia/Phnom_Penh", now) == AT_6


def test_rule_config_comes_from_the_zone_rule_row():
    row = IrrigationRule(moisture_threshold_pct=35, stop_above_pct=50, max_duration_ms=60_000,
                         cooldown_minutes=20, rain_lockout=True, daylight_only=True,
                         daylight_start_h=6, daylight_end_h=17, enabled=True)
    cfg = svc.config_from_rule(row, farm_tz="Asia/Phnom_Penh")
    assert cfg.moisture_threshold_pct == 35 and cfg.max_duration_ms == 60_000
    assert cfg.cooldown_minutes == 20 and cfg.farm_tz == "Asia/Phnom_Penh"


def test_latest_signal_takes_newest_moisture_and_rain_flag():
    t0 = AT_6
    moisture, rain = svc.latest_signal([
        ("soil_moisture", 22.0, t0),
        ("soil_moisture", 31.5, t0 + timedelta(minutes=5)),
        ("rain", 1, t0 + timedelta(minutes=2)),
    ])
    assert moisture == 31.5 and rain is True


def test_no_readings_means_no_signal():
    assert svc.latest_signal([]) == (None, False)


def test_dry_zone_at_six_gets_a_bounded_run():
    d = svc.decide("g1", CFG, moisture=20.0, rain=False, now=AT_6, last_event_ended_at=None)
    assert d.decision is Decision.IRRIGATE
    assert d.duration_ms == 40_000                       # 10 points below 30 % x 4 s
    assert d.text == "g1: water 40 s"


def test_very_dry_zone_is_capped_by_the_rule():
    d = svc.decide("g1", CFG, moisture=0.0, rain=False, now=AT_6, last_event_ended_at=None)
    assert d.duration_ms == CFG.max_duration_ms
    assert d.text == "g1: water 90 s"


def test_wet_zone_is_skipped_with_reason():
    d = svc.decide("g1", CFG, moisture=35.0, rain=False, now=AT_6, last_event_ended_at=None)
    assert d.decision is Decision.HOLD_IN_RANGE
    assert d.text == "g1: skip, soil is wet enough"


def test_rain_defers_even_when_dry():
    d = svc.decide("g1", CFG, moisture=10.0, rain=True, now=AT_6, last_event_ended_at=None)
    assert d.decision is Decision.DEFER_RAIN
    assert d.text == "g1: skip, it is raining"


def test_night_defers_with_reason():
    d = svc.decide("g1", CFG, moisture=10.0, rain=False, now=AT_22, last_event_ended_at=None)
    assert d.decision is Decision.DEFER_DARK
    assert d.text == "g1: skip, too dark to run the pump"


def test_missing_reading_is_a_skip_never_a_run():
    d = svc.decide("g1", CFG, moisture=None, rain=False, now=AT_6, last_event_ended_at=None)
    assert d.decision is Decision.HOLD_IN_RANGE
    assert d.text == "g1: skip, no sensor reading"


def test_recent_run_suppresses_another():
    last = AT_6 - timedelta(minutes=10)
    d = svc.decide("g1", CFG, moisture=20.0, rain=False, now=AT_6, last_event_ended_at=last)
    assert d.decision is Decision.SUPPRESS_COOLDOWN


# ----------------------------------------------------- route (service stubbed)

def test_endpoint_returns_decisions_in_the_documented_shape(monkeypatch):
    async def fake(session, farm_name, now=None):
        return [svc.ZoneDecision("g1", Decision.IRRIGATE, 40_000, "auto_threshold", 20.0, AT_6)]

    async def no_db():
        yield None

    monkeypatch.setattr(decisions_router, "decisions_for_farm", fake)
    app.dependency_overrides[get_db] = no_db
    try:
        r = TestClient(app).get("/api/v1/decisions/today")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    assert r.json()[0] == {
        "zone": "g1", "decision": "irrigate", "text": "g1: water 40 s",
        "durationSeconds": 40, "reason": "auto_threshold", "moisturePct": 20.0, "thresholdPct": None,
        "decisionAt": AT_6.isoformat().replace("+00:00", "Z"),
    }


def test_endpoint_tells_which_threshold_the_bed_is_watered_by(monkeypatch):
    async def fake(session, farm_name, now=None):
        return [svc.ZoneDecision("g1", Decision.HOLD_IN_RANGE, 0, "within_range", 40.0, AT_6,
                                 inputs={"threshold_pct": 30.0})]

    async def no_db():
        yield None

    monkeypatch.setattr(decisions_router, "decisions_for_farm", fake)
    app.dependency_overrides[get_db] = no_db
    try:
        r = TestClient(app).get("/api/v1/decisions/today")
    finally:
        app.dependency_overrides.clear()
    assert r.json()[0]["thresholdPct"] == 30.0


# ------------------------------------------------ integration (real Postgres)

TEST_DB = "aaf_s4_test"


def _payload(moisture: float, rain: int = 0) -> dict:
    return {"device": "ESP-FIELD-01", "fw": "test", "sampleCount": 16, "rssi": -60,
            "measurements": [
                {"metric": "soil_moisture", "value": moisture, "unit": "pct", "quality": "valid"},
                {"metric": "water_ph", "value": 6.8, "unit": "pH", "quality": "uncalibrated"},
                {"metric": "rain", "value": rain, "unit": "bool", "quality": "valid"},
                {"metric": "supply_voltage", "value": 5.0, "unit": "V", "quality": "valid"},
            ]}


def test_telemetry_is_stored_and_drives_todays_decision():
    url = pgdb.require(TEST_DB)

    async def scenario():
        engine = create_async_engine(url)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session() as s:
                await seed_stage1(s, planted_on=date(2026, 10, 15))

            topic = "farm/farm-01/zone/g1/telemetry"
            async with Session() as s:
                assert await store_telemetry(s, topic, _payload(20.0), now=AT_6) == 4
            async with Session() as s:
                by_zone = {d.zone: d for d in await svc.decisions_for_farm(s, "farm-01", now=AT_6)}
            assert by_zone["g1"].decision is Decision.IRRIGATE
            assert by_zone["g1"].text == "G1 Wide orchard (day 21): water 40 s"
            assert by_zone["g2"].text == "G2 Commercial block (day 21): skip, no sensor reading"   # no data yet

            # the newest reading wins: once the soil is wet, the decision flips
            async with Session() as s:
                await store_telemetry(s, topic, _payload(35.0), now=AT_6 + timedelta(minutes=1))
            async with Session() as s:
                by_zone = {d.zone: d for d in await svc.decisions_for_farm(s, "farm-01", now=AT_6)}
            assert by_zone["g1"].text == "G1 Wide orchard (day 21): skip, soil is wet enough"
        finally:
            await engine.dispose()

    asyncio.run(scenario())


def test_telemetry_from_an_unknown_device_is_dropped_not_stored():
    url = pgdb.require(TEST_DB)

    async def scenario():
        engine = create_async_engine(url)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session() as s:
                await seed_stage1(s, planted_on=date(2026, 10, 15))
            rogue = {**_payload(10.0), "device": "NOT-A-DEVICE"}
            async with Session() as s:
                n = await store_telemetry(s, "farm/farm-01/zone/g1/telemetry", rogue, now=AT_6)
            assert n == 0
        finally:
            await engine.dispose()

    asyncio.run(scenario())
