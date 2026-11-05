"""The 7-in-1 soil probe and the air sensor: units, impossible values, and what gets stored.
Pure tests need no database; the integration tests use a throwaway Postgres and are skipped without one."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pgdb
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models.entities import Metric, Quality, Sensor, SensorReading
from app.services import decisions as dec
from app.services import metrics as mx
from app.services.seed import seed_stage1
from app.workers.mqtt_ingest import readings, store_telemetry

AT = datetime(2026, 11, 4, 6, 0, tzinfo=ZoneInfo("Asia/Phnom_Penh")).astimezone(timezone.utc)
TOPIC = "farm/farm-01/zone/g1/telemetry"

# Exactly the payload in the spec.
SPEC_PAYLOAD = {
    "device": "ESP-FIELD-01", "zone": "g1",
    "measurements": [
        {"metric": "soil_moisture", "value": 68.2, "unit": "%"},
        {"metric": "soil_ph", "value": 6.35, "unit": "pH"},
        {"metric": "soil_ec", "value": 2.45, "unit": "mS/cm"},
        {"metric": "soil_temperature", "value": 24.1, "unit": "C"},
        {"metric": "nitrogen", "value": 130, "unit": "mg/kg"},
        {"metric": "phosphorus", "value": 85, "unit": "mg/kg"},
        {"metric": "potassium", "value": 210, "unit": "mg/kg"},
        {"metric": "air_temperature", "value": 28.4, "unit": "C"},
        {"metric": "air_humidity", "value": 72.0, "unit": "%"},
        {"metric": "rain", "value": 0, "unit": "bool"},
    ],
}


# ------------------------------------------------------------------- clean()

def test_every_metric_in_the_spec_payload_is_accepted_in_our_units():
    got = {c.metric.value: (c.value, c.unit) for c in map(mx.clean, SPEC_PAYLOAD["measurements"])}
    assert got == {
        "soil_moisture": (68.2, "pct"), "soil_ph": (6.35, "pH"), "soil_ec": (2.45, "mS/cm"),
        "soil_temperature": (24.1, "C"), "nitrogen": (130, "mg/kg"), "phosphorus": (85, "mg/kg"),
        "potassium": (210, "mg/kg"), "air_temperature": (28.4, "C"), "air_humidity": (72.0, "pct"),
        "rain": (0, "bool")}


def test_every_metric_has_a_spec_and_the_probe_set_is_the_soil_seven():
    assert set(mx.SPECS) == set(Metric)
    assert mx.SOIL_PROBE_METRICS == {Metric.soil_moisture, Metric.soil_ph, Metric.soil_ec, Metric.soil_temperature,
                                     Metric.nitrogen, Metric.phosphorus, Metric.potassium}


@pytest.mark.parametrize("unit,value,expect", [
    ("mS/cm", 2.45, 2.45), ("ms/cm", 2.45, 2.45), ("dS/m", 2.45, 2.45),
    ("uS/cm", 2450, 2.45), ("µS/cm", 2450, 2.45), ("μS/cm", 2450, 2.45),     # micro sign and Greek mu both occur
    ("", 2.45, 2.45), (None, 2.45, 2.45),                                       # no unit: already ours
])
def test_ec_arrives_in_whatever_unit_the_probe_uses_and_is_stored_in_ms_per_cm(unit, value, expect):
    item = {"metric": "soil_ec", "value": value}
    if unit is not None:
        item["unit"] = unit
    c = mx.clean(item)
    assert (c.value, c.unit) == (expect, "mS/cm")


@pytest.mark.parametrize("metric,unit", [("soil_temperature", "°C"), ("air_temperature", "celsius"),
                                         ("air_humidity", "%RH"), ("soil_moisture", "percent"),
                                         ("potassium", "ppm"), ("supply_voltage", "mV")])
def test_common_unit_spellings(metric, unit):
    assert mx.clean({"metric": metric, "value": 10, "unit": unit}).unit == mx.SPECS[Metric(metric)].unit


@pytest.mark.parametrize("item,why", [
    ({"metric": "soil_ph", "value": 655.35, "unit": "pH"}, "outside"),          # dead RS485 link, scaled
    ({"metric": "soil_ph", "value": 0.0, "unit": "pH"}, "outside"),             # disconnected probe
    ({"metric": "soil_temperature", "value": 85, "unit": "C"}, "outside"),      # sensor that has not converted
    ({"metric": "air_temperature", "value": -127, "unit": "C"}, "outside"),
    ({"metric": "air_humidity", "value": 101, "unit": "%"}, "outside"),
    ({"metric": "soil_moisture", "value": 130, "unit": "%"}, "outside"),
    ({"metric": "soil_ec", "value": -0.4, "unit": "mS/cm"}, "outside"),
    ({"metric": "nitrogen", "value": 65535, "unit": "mg/kg"}, "outside"),
    ({"metric": "soil_ec", "value": 25000, "unit": "uS/cm"}, "outside"),         # 25 mS/cm: beyond the probe
    ({"metric": "air_temperature", "value": 80, "unit": "F"}, "not understood"),
    ({"metric": "soil_moisture", "value": 50, "unit": "m3/m3"}, "not understood"),
    ({"metric": "soil_ph", "value": "acid"}, "not a number"),
    ({"metric": "soil_ph", "value": None}, "not a number"),
    ({"metric": "soil_ph"}, "not a number"),
    ({"metric": "soil_ph", "value": float("nan")}, "not finite"),
    ({"metric": "soil_ph", "value": float("inf")}, "not finite"),
    ({"metric": "salinity", "value": 1}, "unknown metric"),
    ({"value": 1}, "unknown metric"),
])
def test_impossible_or_unreadable_values_are_refused_with_a_reason(item, why):
    with pytest.raises(mx.Refused, match=why):
        mx.clean(item)


@pytest.mark.parametrize("metric,low,high", [
    ("soil_moisture", 0, 100), ("soil_ph", 3, 10), ("soil_ec", 0, 20), ("soil_temperature", -10, 60),
    ("nitrogen", 0, 2000), ("air_temperature", -10, 60), ("air_humidity", 0, 100)])
def test_the_edges_of_the_believable_range_are_accepted(metric, low, high):
    assert mx.clean({"metric": metric, "value": low}).value == low
    assert mx.clean({"metric": metric, "value": high}).value == high


def test_quality_and_probe_code_are_kept_and_a_strange_quality_is_suspect():
    c = mx.clean({"metric": "soil_ph", "value": 6.4, "quality": "uncalibrated", "sensor": "S-A-25"})
    assert (c.quality, c.sensor) == (Quality.uncalibrated, "S-A-25")
    assert mx.clean({"metric": "soil_ph", "value": 6.4, "quality": "great"}).quality is Quality.suspect
    assert mx.clean({"metric": "soil_ph", "value": 6.4}).quality is Quality.valid


def test_readings_drops_nan_and_infinity_before_they_reach_the_store():
    batch = {"measurements": [{"metric": "soil_ph", "value": float("nan")}, {"metric": "soil_ph", "value": 6.4},
                              {"metric": "soil_ec", "value": float("inf")}]}
    assert readings(batch) == [{"metric": "soil_ph", "value": 6.4}]


# ------------------------------------------------------------------ integration

def _run(db, scenario):
    url = pgdb.require(db)

    async def go():
        engine = create_async_engine(url)
        async with engine.begin() as c:
            await c.run_sync(Base.metadata.create_all)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session() as s:
                await seed_stage1(s)
            await scenario(Session)
        finally:
            await engine.dispose()

    asyncio.run(go())


async def _rows(Session):
    async with Session() as s:
        got = (await s.execute(select(SensorReading, Sensor.code)
                               .outerjoin(Sensor, SensorReading.sensor_id == Sensor.id))).all()
    return {r.metric.value: (float(r.value), r.unit, code) for r, code in got}


def test_the_spec_payload_is_stored_whole_and_the_probe_readings_belong_to_the_deciding_probe():
    async def scenario(Session):
        async with Session() as s:
            assert await store_telemetry(s, TOPIC, SPEC_PAYLOAD, now=AT) == 10
        got = await _rows(Session)
        assert got["soil_ph"] == (6.35, "pH", "S-A-25") and got["soil_ec"] == (2.45, "mS/cm", "S-A-25")
        for m in ("soil_moisture", "soil_temperature", "nitrogen", "phosphorus", "potassium"):
            assert got[m][2] == "S-A-25", m                    # the deciding probe (25 cm)
        assert got["air_temperature"] == (28.4, "C", None) and got["air_humidity"] == (72.0, "pct", None)
        assert got["rain"][2] is None                           # the air and the rain gauge are the node's, not a probe's

    _run("aaf_probe_ingest_a", scenario)


def test_a_dead_probe_costs_only_its_own_readings(caplog):
    payload = {"device": "ESP-FIELD-01", "zone": "g1", "measurements": [
        {"metric": "soil_ph", "value": 655.35, "unit": "pH"},              # dead RS485 link
        {"metric": "soil_temperature", "value": 85, "unit": "C"},
        {"metric": "soil_ec", "value": 2450, "unit": "uS/cm"},             # fine, in microsiemens
        {"metric": "air_humidity", "value": 71.5, "unit": "%"},
        {"metric": "air_temperature", "value": 80, "unit": "F"}]}           # unit we will not guess at

    async def scenario(Session):
        with caplog.at_level(logging.WARNING, logger="ingest"):
            async with Session() as s:
                assert await store_telemetry(s, TOPIC, payload, now=AT) == 2
        got = await _rows(Session)
        assert set(got) == {"soil_ec", "air_humidity"} and got["soil_ec"][:2] == (2.45, "mS/cm")
        assert "dropped 3 reading(s)" in caplog.text and "655.35" in caplog.text

    _run("aaf_probe_ingest_b", scenario)


def test_a_payload_that_names_another_bed_is_not_stored_under_this_topic():
    async def scenario(Session):
        async with Session() as s:
            assert await store_telemetry(s, TOPIC, {**SPEC_PAYLOAD, "zone": "g2"}, now=AT) == 0
        assert await _rows(Session) == {}

    _run("aaf_probe_ingest_c", scenario)


def test_a_payload_without_the_zone_key_still_works_the_topic_is_enough():
    async def scenario(Session):
        bare = {k: v for k, v in SPEC_PAYLOAD.items() if k != "zone"}
        async with Session() as s:
            assert await store_telemetry(s, TOPIC, bare, now=AT) == 10

    _run("aaf_probe_ingest_d", scenario)


def test_an_unknown_probe_code_drops_that_reading_for_every_soil_metric():
    payload = {"device": "ESP-FIELD-01", "measurements": [
        {"metric": "soil_ph", "value": 6.4, "sensor": "S-NOPE"},
        {"metric": "soil_ph", "value": 6.5, "sensor": "S-A-10"},
        {"metric": "air_temperature", "value": 27, "sensor": "S-NOPE"}]}   # an air reading has no probe: the code is ignored

    async def scenario(Session):
        async with Session() as s:
            assert await store_telemetry(s, TOPIC, payload, now=AT) == 2
        got = await _rows(Session)
        assert got["soil_ph"][0] == 6.5 and got["soil_ph"][2] == "S-A-10" and got["air_temperature"][2] is None

    _run("aaf_probe_ingest_e", scenario)


def test_newest_readings_takes_the_soil_metrics_from_the_deciding_probe_and_ignores_the_shallow_one():
    shallow = {"device": "ESP-FIELD-01", "measurements": [
        {"metric": "soil_ph", "value": 5.0, "sensor": "S-A-10"}, {"metric": "soil_ec", "value": 9.0, "sensor": "S-A-10"}]}

    async def scenario(Session):
        async with Session() as s:
            await store_telemetry(s, TOPIC, SPEC_PAYLOAD, now=AT)
            await store_telemetry(s, TOPIC, shallow, now=AT + timedelta(minutes=1))     # newer, but the wrong depth
        async with Session() as s:
            zone_id = (await s.execute(select(Sensor.zone_id).where(Sensor.code == "S-A-25"))).scalar_one()
            newest = {m: v for m, v, _ in (await dec.newest_readings(s, [zone_id]))[zone_id]}
        assert newest["soil_ph"] == 6.35 and newest["soil_ec"] == 2.45
        assert newest["air_temperature"] == 28.4

    _run("aaf_probe_ingest_f", scenario)
