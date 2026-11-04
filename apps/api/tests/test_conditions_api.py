"""Bed conditions (stage-rated readings and alerts) and reading history, through the service and the HTTP routes."""
import asyncio
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pgdb
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models.entities import Planting, Zone
from app.services import conditions as cond
from app.services import crops as crop_svc
from app.services import history
from app.services.clock import farm_today
from app.services.seed import seed_stage1
from app.workers.mqtt_ingest import store_telemetry

LOCAL = ZoneInfo("Asia/Phnom_Penh")
NOON = datetime(2026, 11, 4, 12, 0, tzinfo=LOCAL).astimezone(timezone.utc)
PLANTED_DAY_50 = date(2026, 11, 4) - timedelta(days=49)
TOPIC = "farm/farm-01/zone/zone-a/telemetry"


def payload(**values):
    units = {"soil_moisture": "%", "soil_ph": "pH", "soil_ec": "mS/cm", "soil_temperature": "C", "nitrogen": "mg/kg",
             "phosphorus": "mg/kg", "potassium": "mg/kg", "air_temperature": "C", "air_humidity": "%"}
    return {"device": "ESP-FIELD-01", "zone": "zone-a",
            "measurements": [{"metric": k, "value": v, "unit": units[k]} for k, v in values.items()]}


HEALTHY = dict(soil_moisture=68.2, soil_ph=6.35, soil_ec=2.45, soil_temperature=24.1, nitrogen=130, phosphorus=85,
               potassium=210, air_temperature=28.4, air_humidity=72.0)


def _run(db, scenario, planted_on=PLANTED_DAY_50):
    url = pgdb.require(db)

    async def go():
        engine = create_async_engine(url)
        async with engine.begin() as c:
            await c.run_sync(Base.metadata.create_all)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session() as s:
                await seed_stage1(s, planted_on=planted_on)
            await scenario(Session)
        finally:
            await engine.dispose()

    asyncio.run(go())


# ------------------------------------------------------------------ conditions

def test_stored_readings_are_rated_against_the_stage_of_the_open_cycle():
    async def scenario(Session):
        async with Session() as s:
            await store_telemetry(s, TOPIC, payload(**HEALTHY), now=NOON)
        async with Session() as s:
            beds = {b["zone"]: b for b in await cond.bed_conditions(s, "farm-01", now=NOON)}
        a, b = beds["zone-a"], beds["zone-b"]
        assert (a["label"], a["crop"], a["cropName"], a["day"]) == ("Tomato bed A", "tomato", "Tomato", 50)
        assert a["stage"]["key"] == "flowering" and a["stage"]["moisture"] == [65, 80]
        assert a["status"] == "normal" and a["alerts"] == [] and a["rated"] is True
        assert [p["status"] for p in a["params"]] == ["normal"] * 9
        assert a["recordedAt"] is not None
        assert b["status"] == "no_data" and b["recordedAt"] is None and b["stage"]["key"] == "flowering"

    _run("aaf_cond_a", scenario)


def test_heat_dry_soil_and_salt_raise_the_alerts_of_the_spec():
    async def scenario(Session):
        async with Session() as s:
            await store_telemetry(s, TOPIC, payload(**{**HEALTHY, "air_temperature": 34.0, "soil_moisture": 40.0,
                                                       "soil_ec": 4.4, "soil_temperature": 31.0, "soil_ph": 5.5,
                                                       "air_humidity": 90.0}), now=NOON)
        async with Session() as s:
            a = next(b for b in await cond.bed_conditions(s, "farm-01", now=NOON) if b["zone"] == "zone-a")
        assert {x["id"] for x in a["alerts"]} == {"pollen_sterility", "calcium_lockup", "fungal_window", "salinity",
                                                   "root_heat", "flowering_moisture_floor"}
        assert a["status"] == "critical"
        by_metric = {p["metric"]: p for p in a["params"]}
        assert by_metric["air_temperature"]["status"] == "critical" and by_metric["soil_ph"]["direction"] == "low"

    _run("aaf_cond_b", scenario)


def test_a_reading_from_hours_ago_is_old_news_not_an_alert():
    async def scenario(Session):
        async with Session() as s:
            await store_telemetry(s, TOPIC, payload(air_temperature=40.0), now=NOON - timedelta(hours=3))
        async with Session() as s:
            a = next(b for b in await cond.bed_conditions(s, "farm-01", now=NOON) if b["zone"] == "zone-a")
        assert a["alerts"] == [] and a["status"] == "stale"
        assert next(p for p in a["params"] if p["metric"] == "air_temperature")["value"] == 40.0   # still shown

    _run("aaf_cond_c", scenario)


def test_the_same_morning_reading_means_different_things_at_different_crop_days():
    async def scenario(Session):
        async with Session() as s:
            await store_telemetry(s, TOPIC, payload(soil_moisture=52.0), now=NOON)
        out = {}
        for day in (80, 50):
            async with Session() as s:
                p = (await s.execute(select(Planting).join(Zone).where(Zone.name == "zone-a"))).scalar_one()
                p.planted_on = date(2026, 11, 4) - timedelta(days=day - 1)
                await s.commit()
            async with Session() as s:
                a = next(b for b in await cond.bed_conditions(s, "farm-01", now=NOON) if b["zone"] == "zone-a")
            out[day] = (a["stage"]["key"], a["params"][0]["status"], [x["id"] for x in a["alerts"]])
        assert out[80] == ("fruiting", "normal", [])                              # 52 % is right for fruit bulking
        assert out[50] == ("flowering", "critical", ["flowering_moisture_floor"])  # and under the flowering floor

    _run("aaf_cond_d", scenario)


def test_a_bed_with_no_open_cycle_has_no_stage_and_no_alerts():
    async def scenario(Session):
        async with Session() as s:
            for p in (await s.execute(select(Planting))).scalars():
                p.ended_on = date(2026, 11, 1)
            await s.commit()
            await store_telemetry(s, TOPIC, payload(air_temperature=40.0, soil_moisture=60.0), now=NOON)
        async with Session() as s:
            a = next(b for b in await cond.bed_conditions(s, "farm-01", now=NOON) if b["zone"] == "zone-a")
        assert a["crop"] is None and a["day"] is None and a["stage"] is None and a["alerts"] == []
        assert a["params"][0]["status"] == "normal" and a["params"][0]["target"] == [50, 80]   # the general range

    _run("aaf_cond_e", scenario)


def test_a_bed_of_a_crop_without_a_stage_table_is_shown_but_not_rated():
    async def scenario(Session):
        async with Session() as s:
            cucumber = await crop_svc.create_crop(s, "Cucumber", {"ini": 0.6, "mid": 1.0, "end": 0.75}, [20, 30, 40, 15])
            zone = (await s.execute(select(Zone).where(Zone.name == "zone-a"))).scalar_one()
            for p in (await s.execute(select(Planting).where(Planting.zone_id == zone.id))).scalars():
                p.ended_on = date(2026, 11, 1)
            s.add(Planting(zone_id=zone.id, crop_id=cucumber.id, planted_on=date(2026, 10, 20)))
            await s.commit()
            await store_telemetry(s, TOPIC, payload(soil_moisture=10.0, air_temperature=40.0), now=NOON)
        async with Session() as s:
            a = next(b for b in await cond.bed_conditions(s, "farm-01", now=NOON) if b["zone"] == "zone-a")
        assert (a["crop"], a["rated"], a["status"], a["alerts"]) == ("cucumber", False, "unrated", [])
        assert a["params"][0]["value"] == 10.0 and a["params"][0]["status"] == "unrated"

    _run("aaf_cond_f", scenario)


def test_the_conditions_route_and_the_unknown_farm():
    async def scenario(Session):
        async with Session() as s:
            await store_telemetry(s, TOPIC, payload(air_temperature=33.0), now=datetime.now(timezone.utc))
        async with pgdb.api(Session) as client:
            r = await client.get("/api/v1/conditions")
            assert r.status_code == 200
            beds = {b["zone"]: b for b in r.json()}
            assert set(beds) == {"zone-a", "zone-b"}
            assert {"zone", "label", "areaM2", "crop", "cropName", "variety", "day", "recordedAt", "rated", "status",
                    "basis", "stage", "params", "alerts"} <= beds["zone-a"].keys()
            assert beds["zone-a"]["params"][7]["metric"] == "air_temperature"
            assert (await client.get("/api/v1/conditions?farm=no-such-farm")).json() == []

    _run("aaf_cond_g", scenario, planted_on=farm_today() - timedelta(days=49))


# --------------------------------------------------------------------- history

def test_history_is_bucketed_averaged_and_comes_from_the_deciding_probe():
    async def scenario(Session):
        async with Session() as s:
            # two readings in the same hour, one an hour later, and a shallow-probe pH that must be ignored
            await store_telemetry(s, TOPIC, payload(soil_ph=6.0, air_temperature=26.0), now=NOON - timedelta(hours=2))
            await store_telemetry(s, TOPIC, payload(soil_ph=6.4, air_temperature=28.0), now=NOON - timedelta(hours=2, minutes=-10))
            await store_telemetry(s, TOPIC, payload(soil_ph=6.2, air_temperature=30.0), now=NOON - timedelta(minutes=5))
            await store_telemetry(s, TOPIC, {"device": "ESP-FIELD-01", "measurements": [
                {"metric": "soil_ph", "value": 9.0, "unit": "pH", "sensor": "S-A-10"}]}, now=NOON - timedelta(minutes=4))
        async with Session() as s:
            out = await history.series(s, "farm-01", "zone-a", history.parse_metrics("soil_ph,air_temperature"),
                                       hours=3, points=3, now=NOON)
        assert out["zone"] == "zone-a" and out["bucketSeconds"] == 3600 and out["hours"] == 3
        ph = out["series"]["soil_ph"]
        assert [p["v"] for p in ph] == [6.2, 6.2] and len(ph) == 2          # (6.0 + 6.4) / 2, then 6.2: never the 9.0
        air = out["series"]["air_temperature"]
        assert [p["v"] for p in air] == [27.0, 30.0]                        # the air sensor belongs to the node
        assert ph[0]["t"] < ph[1]["t"] and ph[0]["t"].endswith("+00:00")

    _run("aaf_hist_a", scenario)


def test_history_window_excludes_old_and_future_readings_and_empty_metrics_are_empty_lists():
    async def scenario(Session):
        async with Session() as s:
            await store_telemetry(s, TOPIC, payload(soil_ph=6.1), now=NOON - timedelta(hours=30))
            await store_telemetry(s, TOPIC, payload(soil_ph=6.5), now=NOON + timedelta(hours=1))
        async with Session() as s:
            out = await history.series(s, "farm-01", "zone-a", history.parse_metrics("soil_ph,soil_ec"), hours=24, now=NOON)
        assert out["series"] == {"soil_ph": [], "soil_ec": []}

    _run("aaf_hist_b", scenario)


def test_history_route_answers_and_refuses_bad_asks():
    async def scenario(Session):
        async with Session() as s:
            await store_telemetry(s, TOPIC, payload(soil_ph=6.3), now=datetime.now(timezone.utc) - timedelta(minutes=2))
        async with pgdb.api(Session) as client:
            ok = await client.get("/api/v1/telemetry/zone-a?metrics=soil_ph&hours=1&points=10")
            assert ok.status_code == 200 and ok.json()["series"]["soil_ph"][0]["v"] == 6.3
            assert (await client.get("/api/v1/telemetry/zone-zzz")).status_code == 404
            assert (await client.get("/api/v1/telemetry/zone-a?metrics=salinity")).status_code == 422
            assert (await client.get("/api/v1/telemetry/zone-a?hours=0")).status_code == 422
            assert (await client.get("/api/v1/telemetry/zone-a?hours=99999")).status_code == 422
            assert (await client.get("/api/v1/telemetry/zone-a?metrics=")).status_code == 422

    _run("aaf_hist_c", scenario)


def test_bucket_size_never_drops_below_a_minute_and_covers_the_window():
    assert history.bucket_seconds(1, 500) == 60
    assert history.bucket_seconds(24, 96) == 900
    assert history.bucket_seconds(168, 100) == 6048
    assert history.bucket_seconds(168, 100) * 100 >= 168 * 3600


def test_bucket_size_survives_a_zero_point_ask():
    assert history.bucket_seconds(24, 0) == 24 * 3600


def test_a_crop_with_no_slug_is_unrated_not_nothing_planted():
    import types
    snap = cond.BedSnapshot(zone=types.SimpleNamespace(name="z"), readings={"air_temperature": cond.Reading(40.0, NOON)},
                            planting=object(), crop=types.SimpleNamespace(slug=None), day=50, farm_tz="Asia/Phnom_Penh")
    a = snap.assess(NOON)
    assert (a.rated, a.alerts, a.status) == (False, (), "unrated")
