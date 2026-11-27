"""Tomato targets: what each reading should be on a tomato block, and the rules that fire."""
from datetime import datetime, timedelta, timezone

import pgdb

from app.services import tomato
from app.services.guava import Reading

NOW = datetime(2026, 11, 27, 9, 0, tzinfo=timezone.utc)
GOOD = {"soil_moisture": 65.0, "soil_ph": 6.4, "soil_ec": 1.6, "soil_temperature": 24.0, "nitrogen": 110.0,
        "phosphorus": 80.0, "potassium": 190.0, "air_temperature": 27.0, "air_humidity": 70.0}


def rated(values: dict, *, at=NOW, recent_min=None) -> dict:
    return tomato.rate_bed({k: Reading(v, at) for k, v in values.items()}, now=NOW, recent_min=recent_min)


def status(out: dict, metric: str) -> tuple[str, str | None]:
    p = next(p for p in out["params"] if p["metric"] == metric)
    return p["status"], p["direction"]


def test_a_good_tomato_bed_is_normal_and_npk_is_never_rated():
    out = rated(GOOD)
    assert out["status"] == "normal" and out["alerts"] == [] and out["basis"] == "tomato_general"
    assert [status(out, m)[0] for m in ("nitrogen", "phosphorus", "potassium")] == ["unrated"] * 3
    assert next(p for p in out["params"] if p["metric"] == "soil_ph")["target"] == [6.0, 6.8]


def test_the_targets_are_tomatos_not_guavas():
    # guava's pH band is 5.5-7.0; tomato wants 6.0-6.8, and blossom-end rot follows acid soil
    assert status(rated({**GOOD, "soil_ph": 5.8}), "soil_ph") == ("warning", "low")
    acid = rated({**GOOD, "soil_ph": 5.3})
    assert status(acid, "soil_ph") == ("critical", "low") and acid["alerts"][0]["id"] == "acid"
    # salt: yield falls above ECe 2.5 (Maas & Hoffman); above 4.0 is critical
    assert [a["id"] for a in rated({**GOOD, "soil_ec": 2.8})["alerts"]] == ["salty"]
    assert status(rated({**GOOD, "soil_ec": 4.3}), "soil_ec") == ("critical", "high")
    assert [a["id"] for a in rated({**GOOD, "soil_ec": 0.7})["alerts"]] == ["low_ec"]


def test_heat_humidity_and_water_swings():
    assert [a["id"] for a in rated({**GOOD, "air_temperature": 33.0})["alerts"]] == ["warm"]
    assert status(rated({**GOOD, "air_temperature": 36.0}), "air_temperature") == ("critical", "high")
    assert rated({**GOOD, "air_humidity": 88.0})["alerts"][0]["severity"] == "warning"
    assert rated({**GOOD, "air_humidity": 92.0})["status"] == "critical"
    swing = rated({**GOOD, "soil_moisture": 74.0}, recent_min=38.0)
    assert [a["id"] for a in swing["alerts"]] == ["water_swing"]          # blossom-end rot from uneven water
    assert rated({**GOOD, "soil_moisture": 40.0})["status"] == "critical"


def test_old_readings_are_stale_not_rated():
    out = rated(GOOD, at=NOW - timedelta(days=3))
    assert out["status"] == "stale" and out["alerts"] == []


def test_the_rules_carry_mulders_chart_and_say_the_probe_cannot_do_it():
    rules = {r["label"]: r for r in rated(GOOD)["rules"]}
    mulder = rules["Nutrients together (Mulder's chart)"]
    assert "potassium blocks magnesium and calcium" in mulder["note"] and "not a dose" in mulder["note"]
    assert "lab test" in rules["N, P, K"]["note"]


def test_only_a_tomato_plant_map_gets_these_targets():
    assert tomato.is_tomato("Tomato") and tomato.is_tomato("Cherry tomato") and not tomato.is_tomato("Chilli")
    assert not tomato.is_tomato(None)


@pgdb.with_db("aaf_tomato_conditions")
async def test_the_farm_page_rates_the_tomato_block(Session):
    from app.models.entities import Device, SensorReading, Metric, Zone
    from sqlalchemy import select
    from app.services.seed import seed_stage1, seed_tomato_demo
    async with Session() as s:
        await seed_stage1(s, beds=())
    async with Session() as s:
        await seed_tomato_demo(s)
    async with Session() as s:
        zone = await s.scalar(select(Zone).where(Zone.name == "t1"))
        rover = await s.scalar(select(Device).where(Device.code == "ROVER-01"))
        at = datetime.now(timezone.utc) - timedelta(minutes=5)
        for metric, value in {**GOOD, "soil_ph": 5.3}.items():
            s.add(SensorReading(device_id=rover.id, zone_id=zone.id, metric=Metric(metric), value=value, unit="x", recorded_at=at))
        await s.commit()
    async with pgdb.api(Session) as c:
        beds = (await c.get("/api/v1/conditions")).json()
        t1 = next(b for b in beds if b["zone"] == "t1")
        assert (t1["crop"], t1["cropName"], t1["basis"], t1["status"]) == ("tomato", "Tomato", "tomato_general", "critical")
        assert [a["id"] for a in t1["alerts"]] == ["acid"] and t1["rules"]
