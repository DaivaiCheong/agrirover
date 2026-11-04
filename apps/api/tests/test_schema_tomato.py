"""Schema step: tomato seed, probes at two depths, stored daily decisions, trial arms.

Example crop is tomato. Database tests use a throwaway Postgres and skip when none is
reachable."""
import json
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import pgdb
from sqlalchemy import func, select

from app.models.entities import (ActionProposal, CropProfile, DailyDecision, DiseaseClass, Planting,
                                 Sensor, SensorReading, TrialArm, Zone)
from app.services import decisions as svc
from app.services.daily_message import send_daily_message
from app.services.rule_engine import Decision
from app.services.seed import seed_stage1
from app.workers.mqtt_ingest import store_telemetry

AT_6 = datetime(2026, 11, 4, 6, 0, tzinfo=ZoneInfo("Asia/Phnom_Penh")).astimezone(timezone.utc)
PLANTED = date(2026, 10, 15)                      # 21 days before 4 Nov: "day 21"
TOPIC_A = "farm/farm-01/zone/zone-a/telemetry"
TOPIC_B = "farm/farm-01/zone/zone-b/telemetry"


def payload(*soil, rain=0):
    """soil = (sensor_code | None, value) pairs."""
    m = []
    for code, value in soil:
        item = {"metric": "soil_moisture", "value": value, "unit": "pct", "quality": "valid"}
        if code:
            item["sensor"] = code
        m.append(item)
    m.append({"metric": "rain", "value": rain, "unit": "bool", "quality": "valid"})
    return {"device": "ESP-FIELD-01", "fw": "t", "sampleCount": 16, "measurements": m}


async def seeded(Session):
    async with Session() as s:
        await seed_stage1(s, planted_on=PLANTED)


@pgdb.with_db("aaf_schema_seed")
async def test_seed_builds_the_tomato_farm_and_is_repeatable(Session):
    await seeded(Session)
    await seeded(Session)                                            # second run adds nothing
    async with Session() as s:
        tomato = (await s.execute(select(CropProfile))).scalar_one()
        zones = {z.name: z for z in (await s.execute(select(Zone))).scalars()}
        plantings = (await s.execute(select(Planting))).scalars().all()
        sensors = (await s.execute(select(Sensor))).scalars().all()
        n_classes = (await s.execute(select(func.count()).select_from(DiseaseClass))).scalar_one()
    assert tomato.common_name == "Tomato"
    assert set(zones) == {"zone-a", "zone-b"}
    assert zones["zone-a"].label == "Tomato bed A" and zones["zone-a"].trial_arm is TrialArm.guided
    assert zones["zone-b"].label == "Tomato bed B" and zones["zone-b"].trial_arm is TrialArm.usual
    assert all(z.crop_id == tomato.id for z in zones.values())
    assert len(plantings) == 2 and all(p.planted_on == PLANTED for p in plantings)
    assert sorted(x.code for x in sensors) == ["S-A-10", "S-A-25", "S-B-10", "S-B-25"]
    deciding = {x.code for x in sensors if x.used_for_decision}
    assert deciding == {"S-A-25", "S-B-25"}                          # the deeper probe decides
    assert n_classes == 0                                            # classes come with the model's labels


@pgdb.with_db("aaf_schema_probe")
async def test_a_reading_goes_to_the_named_probe_or_the_deciding_one(Session):
    await seeded(Session)
    async with Session() as s:
        n = await store_telemetry(s, TOPIC_A, payload(("S-A-10", 40.0), ("S-A-25", 20.0), (None, 21.0),
                                                      ("S-Z-99", 5.0)), now=AT_6)
    assert n == 4                                                    # 3 soil + rain; the unknown probe is dropped
    async with Session() as s:
        codes = {sid: code for sid, code in (await s.execute(select(Sensor.id, Sensor.code))).all()}
        soil = (await s.execute(select(SensorReading).where(SensorReading.metric == "soil_moisture"))).scalars().all()
    by_code = sorted((codes[r.sensor_id], float(r.value)) for r in soil)
    assert by_code == [("S-A-10", 40.0), ("S-A-25", 20.0), ("S-A-25", 21.0)]   # unnamed -> deciding probe


@pgdb.with_db("aaf_schema_decide")
async def test_the_decision_reads_only_the_deciding_probe(Session):
    await seeded(Session)
    async with Session() as s:                                       # surface wet, root zone dry
        await store_telemetry(s, TOPIC_A, payload(("S-A-10", 45.0), ("S-A-25", 20.0)), now=AT_6)
    async with Session() as s:
        d = {x.zone: x for x in await svc.decisions_for_farm(s, "farm-01", now=AT_6)}["zone-a"]
    assert d.decision is Decision.IRRIGATE and d.duration_ms == 40_000
    assert d.text == "Tomato bed A (day 21): water 40 s"

    async with Session() as s:                                       # now surface dry, root zone fine
        await store_telemetry(s, TOPIC_A, payload(("S-A-10", 10.0), ("S-A-25", 35.0)),
                              now=AT_6.replace(minute=5))
    async with Session() as s:
        d = {x.zone: x for x in await svc.decisions_for_farm(s, "farm-01", now=AT_6)}["zone-a"]
    assert d.decision is Decision.HOLD_IN_RANGE
    assert d.text == "Tomato bed A (day 21): skip, soil is wet enough"


@pgdb.with_db("aaf_schema_history")
async def test_every_decision_is_stored_once_per_zone_per_day(Session):
    await seeded(Session)
    async with Session() as s:
        await store_telemetry(s, TOPIC_A, payload(("S-A-25", 20.0)), now=AT_6)
    for _ in range(2):                                               # running twice must not duplicate
        async with Session() as s:
            await svc.record_decisions(s, "farm-01", now=AT_6)
    async with Session() as s:
        zone_names = {zid: name for zid, name in (await s.execute(select(Zone.id, Zone.name))).all()}
        rows = {zone_names[r.zone_id]: r for r in (await s.execute(select(DailyDecision))).scalars()}
    assert set(rows) == {"zone-a", "zone-b"} and len(rows) == 2
    a, b = rows["zone-a"], rows["zone-b"]
    assert a.decision_date == date(2026, 11, 4) and a.decision == "irrigate" and a.duration_s == 40
    inputs = json.loads(a.inputs)
    assert inputs["moisture_pct"] == 20.0 and inputs["sensor"] == "S-A-25"
    assert inputs["planting_day"] == 21 and inputs["rain"] is False and inputs["threshold_pct"] == 30.0
    assert b.decision == "hold_in_range" and b.reason == "no_reading"


@pgdb.with_db("aaf_schema_arms")
async def test_the_usual_bed_is_recorded_but_never_messaged(Session):
    class Fake:
        def __init__(self):
            self.sent = []

        async def send_message(self, chat_id, text, buttons=None):
            self.sent.append(text)
            return 1

    await seeded(Session)
    async with Session() as s:                                       # both beds are dry
        await store_telemetry(s, TOPIC_A, payload(("S-A-25", 20.0)), now=AT_6)
        await store_telemetry(s, TOPIC_B, payload(("S-B-25", 20.0)), now=AT_6)
    tg = Fake()
    async with Session() as s:
        ids = await send_daily_message(s, tg, farm_name="farm-01", chat_id="1001", now=AT_6)
    assert len(ids) == 1                                             # only the guided bed asks for approval
    assert "Tomato bed A (day 21): water 40 s" in tg.sent[0] and "Tomato bed B" not in tg.sent[0]

    async with Session() as s:
        names = {zid: n for zid, n in (await s.execute(select(Zone.id, Zone.name))).all()}
        rows = {names[r.zone_id]: r for r in (await s.execute(select(DailyDecision))).scalars()}
        proposal = (await s.execute(select(ActionProposal))).scalar_one()
    assert rows["zone-a"].proposal_id == proposal.id and rows["zone-a"].message_sent_at is not None
    assert rows["zone-b"].decision == "irrigate"                     # what the system WOULD have said
    assert rows["zone-b"].proposal_id is None and rows["zone-b"].message_sent_at is None
