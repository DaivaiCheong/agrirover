"""Schema step: guava seed, probes at two depths, stored daily decisions, trial arms.

Example crop is guava. Database tests use a throwaway Postgres and skip when none is
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
TOPIC_A = "farm/farm-01/zone/g1/telemetry"
TOPIC_B = "farm/farm-01/zone/g2/telemetry"


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
async def test_seed_builds_the_guava_farm_and_is_repeatable(Session):
    await seeded(Session)
    await seeded(Session)                                            # second run adds nothing
    async with Session() as s:
        guava = (await s.execute(select(CropProfile))).scalar_one()
        zones = {z.name: z for z in (await s.execute(select(Zone))).scalars()}
        plantings = (await s.execute(select(Planting))).scalars().all()
        sensors = (await s.execute(select(Sensor))).scalars().all()
        n_classes = (await s.execute(select(func.count()).select_from(DiseaseClass))).scalar_one()
    assert guava.common_name == "Guava"
    assert set(zones) == {"g1", "g2", "g3", "g4", "g5", "g6"}
    assert zones["g1"].label == "G1 Wide orchard" and zones["g1"].trial_arm is TrialArm.guided
    assert zones["g2"].label == "G2 Kimju block" and zones["g2"].trial_arm is TrialArm.usual
    assert all(z.crop_id == guava.id for z in zones.values())
    assert len(plantings) == 5 and all(p.planted_on == PLANTED for p in plantings)
    assert sorted(x.code for x in sensors) == [f"S-{x}-{d}" for x in "ABCDEF" for d in (10, 25)]
    deciding = {x.code for x in sensors if x.used_for_decision}
    assert deciding == {f"S-{x}-25" for x in "ABCDEF"}                          # the deeper probe decides
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
        d = {x.zone: x for x in await svc.decisions_for_farm(s, "farm-01", now=AT_6)}["g1"]
    assert d.decision is Decision.IRRIGATE and d.duration_ms == 40_000
    assert d.text == "G1 Wide orchard (day 21): water 40 s"

    async with Session() as s:                                       # now surface dry, root zone fine
        await store_telemetry(s, TOPIC_A, payload(("S-A-10", 10.0), ("S-A-25", 35.0)),
                              now=AT_6.replace(minute=5))
    async with Session() as s:
        d = {x.zone: x for x in await svc.decisions_for_farm(s, "farm-01", now=AT_6)}["g1"]
    assert d.decision is Decision.HOLD_IN_RANGE
    assert d.text == "G1 Wide orchard (day 21): skip, soil is wet enough"


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
    assert set(rows) == {"g1", "g2", "g3", "g4", "g5", "g6"} and len(rows) == 6
    a, b = rows["g1"], rows["g2"]
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
    assert "G1 Wide orchard (day 21): water 40 s" in tg.sent[0] and "G2 Kimju block" not in tg.sent[0]

    async with Session() as s:
        names = {zid: n for zid, n in (await s.execute(select(Zone.id, Zone.name))).all()}
        rows = {names[r.zone_id]: r for r in (await s.execute(select(DailyDecision))).scalars()}
        proposal = (await s.execute(select(ActionProposal))).scalar_one()
    assert rows["g1"].proposal_id == proposal.id and rows["g1"].message_sent_at is not None
    assert rows["g2"].decision == "irrigate"                     # what the system WOULD have said
    assert rows["g2"].proposal_id is None and rows["g2"].message_sent_at is None


def test_a_bed_not_planted_yet_is_never_called_day_minus_something():
    base = dict(zone="zone-c", decision=Decision.HOLD_IN_RANGE, reason="no_reading", duration_ms=0, moisture_pct=None,
                decision_at=AT_6, label="G3 Hedgerow")
    assert svc.ZoneDecision(**base, planting_day=-9).text == "G3 Hedgerow (not planted yet): skip, no sensor reading"
    assert svc.ZoneDecision(**base, planting_day=0).name == "G3 Hedgerow (not planted yet)"
    assert svc.ZoneDecision(**base, planting_day=1).name == "G3 Hedgerow (day 1)"
    assert svc.ZoneDecision(**base).name == "G3 Hedgerow"
