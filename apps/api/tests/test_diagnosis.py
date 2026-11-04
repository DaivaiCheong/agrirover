"""Camera symptom set against live telemetry: the four rules of the farm table, label matching, and the routes."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pgdb
import pytest

from app.core.db import get_db  # noqa: F401  (pgdb.api overrides it)
from app.main import app
from app.services import diagnosis as dx
from app.services.agronomy import Reading, stage_for_day, TOMATO_STAGES
from app.services.disease import get_classifier
from app.services.seed import seed_stage1
from app.services.clock import farm_today
from app.workers.mqtt_ingest import store_telemetry

V1 = "/api/v1"
NOW = datetime(2026, 11, 4, 12, 0, tzinfo=ZoneInfo("Asia/Phnom_Penh"))
FLOWERING = stage_for_day(TOMATO_STAGES, 50)          # moisture 65-80, EC 2.2-3.0
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64


def r(**values):
    return {k: Reading(float(v), NOW) for k, v in values.items()}


def verdict(symptom, stage=FLOWERING, **values):
    return dx.correlate(symptom, r(**values), stage=stage, now=NOW)


# ----------------------------------------------------------------- label matching

@pytest.mark.parametrize("label,symptom", [
    ("Tomato___Early_blight", "early_blight"), ("tomato early blight", "early_blight"),
    ("Alternaria solani", "early_blight"),
    ("blossom_end_rot", "blossom_end_rot"), ("Tomato - Blossom-End-Rot", "blossom_end_rot"),
    ("leaf_curl", "leaf_curl"), ("Leaf curling", "leaf_curl"),
    ("Interveinal chlorosis", "interveinal_chlorosis"), ("interveinal", "interveinal_chlorosis"),
])
def test_model_labels_map_to_the_four_symptoms(label, symptom):
    assert dx.match_symptom(label) == symptom


@pytest.mark.parametrize("label", [
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus",      # a whitefly virus: shade cloth does not cure it
    "tomato leaf curl virus", "TYLCV", "yellow leaf curl",
    "Tomato___Late_blight", "Tomato___healthy", "healthy", "", None, "number",
])
def test_labels_that_are_not_one_of_the_four_are_not_forced_into_one(label):
    assert dx.match_symptom(label) is None


# ------------------------------------------------------------------ the four rules

def test_blossom_end_rot_dry_or_acid_root_zone_with_the_spec_sentence():
    ok = verdict("blossom_end_rot", soil_moisture=62, soil_ph=6.4)
    assert ok["verdict"] == "not_supported" and ok["explanation"] is None
    assert verdict("blossom_end_rot", soil_moisture=50.0, soil_ph=5.8)["verdict"] == "not_supported"      # strict, as in the spec
    dry = verdict("blossom_end_rot", soil_moisture=49.9, soil_ph=6.4)
    assert dry["verdict"] == "supported"
    assert dry["explanation"] == ("Calcium transport locked by dry/acidic root zone. "
                                  "Increase drip volume and spray foliar calcium.")
    assert dry["basis"] == "spec"
    assert verdict("blossom_end_rot", soil_moisture=60, soil_ph=5.79)["verdict"] == "supported"


def test_blossom_end_rot_has_its_own_50_percent_line_not_the_45_of_the_alert():
    # 47 % does not trip the Calcium lockup alert (below 45) but the symptom is already on the leaf
    assert verdict("blossom_end_rot", soil_moisture=47)["verdict"] == "supported"


def test_early_blight_needs_humid_air():
    assert verdict("early_blight", air_humidity=80.0)["verdict"] == "not_supported"
    hot = verdict("early_blight", air_humidity=80.1)
    assert hot["verdict"] == "supported"
    assert hot["explanation"] == "Fungal sporulation favored by stagnant high humidity. Prune lower foliage and ventilate."


def test_leaf_curl_heat_air_or_root_zone_and_the_spec_sentence():
    assert verdict("leaf_curl", air_temperature=32.0, soil_temperature=30.0, soil_moisture=70)["verdict"] == "not_supported"
    air = verdict("leaf_curl", air_temperature=32.1, soil_moisture=70)
    assert air["verdict"] == "supported" and air["explanation"] == "Physiological defense to reduce transpiration. Deploy shade cloth."
    assert air["basis"] == "spec"
    soil = verdict("leaf_curl", soil_temperature=30.1, soil_moisture=70)         # the Root heat stress line, not 32
    assert soil["verdict"] == "supported" and "shade cloth" in soil["explanation"]


def test_leaf_curl_with_only_a_dry_root_zone_says_so_and_is_marked_practice():
    dry = verdict("leaf_curl", air_temperature=28, soil_moisture=60)             # flowering wants 65+
    assert dry["verdict"] == "supported" and "dry root zone" in dry["explanation"] and "shade cloth" not in dry["explanation"]
    assert dry["basis"] == "practice"
    both = verdict("leaf_curl", air_temperature=34, soil_moisture=60)
    assert both["explanation"] == ("Physiological defense to reduce transpiration. Deploy shade cloth. "
                                   "The root zone is dry as well. Check the irrigation.")      # one sentence of each, none repeated
    assert both["basis"] == "practice"


def test_the_moisture_deficit_for_leaf_curl_is_the_stages_own_floor():
    fruiting = stage_for_day(TOMATO_STAGES, 80)                                  # 50-65: 55 % is fine
    assert verdict("leaf_curl", stage=fruiting, soil_moisture=55)["verdict"] == "not_supported"
    assert verdict("leaf_curl", stage=FLOWERING, soil_moisture=55)["verdict"] == "supported"
    assert verdict("leaf_curl", stage=None, soil_moisture=55)["verdict"] == "not_supported"     # general range 50-80
    assert verdict("leaf_curl", stage=None, soil_moisture=49)["verdict"] == "supported"


def test_leaf_curl_always_carries_the_virus_caveat_and_others_do_not():
    assert "whitefly" in verdict("leaf_curl", air_temperature=20)["caveat"]
    assert verdict("early_blight", air_humidity=90)["caveat"] is None


def test_chlorosis_alkaline_soil_or_a_high_salt_load():
    assert verdict("interveinal_chlorosis", soil_ph=7.2, soil_ec=2.5)["verdict"] == "not_supported"
    alk = verdict("interveinal_chlorosis", soil_ph=7.21, soil_ec=2.5)
    assert alk["verdict"] == "supported"
    assert alk["explanation"] == "Micronutrient lockout (Iron/Magnesium) due to alkaline soil. Acidify irrigation water."
    salt = verdict("interveinal_chlorosis", soil_ph=6.5, soil_ec=3.1)            # flowering target tops out at 3.0
    assert salt["verdict"] == "supported" and "high salt load" in salt["explanation"] and salt["basis"] == "practice"
    both = verdict("interveinal_chlorosis", soil_ph=7.5, soil_ec=3.5)
    assert both["explanation"].count("Micronutrient lockout") == 1 and "Acidify irrigation water." in both["explanation"]
    assert both["explanation"].endswith("A high salt load adds to it. Flush with clean water before feeding again.")
    assert verdict("interveinal_chlorosis", stage=None, soil_ph=6.5, soil_ec=3.4)["verdict"] == "not_supported"   # general 3.5
    assert verdict("interveinal_chlorosis", stage=None, soil_ph=6.5, soil_ec=3.6)["verdict"] == "supported"


# --------------------------------------------------------------- gaps and old data

def test_no_readings_is_no_data_not_a_reassuring_not_supported():
    out = dx.correlate("blossom_end_rot", {}, stage=FLOWERING, now=NOW)
    assert out["verdict"] == "no_data" and [e["value"] for e in out["evidence"]] == [None, None]


def test_one_missing_reading_does_not_hide_a_fresh_one_that_fits():
    out = verdict("blossom_end_rot", soil_moisture=40)                           # no pH reported
    assert out["verdict"] == "supported"
    assert [(e["metric"], e["met"]) for e in out["evidence"]] == [("soil_moisture", True), ("soil_ph", None)]


def test_a_reading_older_than_30_minutes_is_shown_but_does_not_count():
    old = {"soil_moisture": Reading(30.0, NOW - timedelta(minutes=31))}
    out = dx.correlate("blossom_end_rot", old, stage=FLOWERING, now=NOW)
    assert out["verdict"] == "no_data"
    m = out["evidence"][0]
    assert (m["value"], m["stale"], m["met"], m["ageSeconds"]) == (30.0, True, None, 31 * 60)


def test_a_fresh_reading_that_does_not_fit_beats_an_old_one_that_does():
    mixed = {"soil_moisture": Reading(62.0, NOW), "soil_ph": Reading(5.0, NOW - timedelta(hours=2))}
    assert dx.correlate("blossom_end_rot", mixed, stage=FLOWERING, now=NOW)["verdict"] == "not_supported"


def test_evidence_describes_each_comparison():
    e = verdict("early_blight", air_humidity=88)["evidence"][0]
    assert e == {"metric": "air_humidity", "label": "Air humidity", "unit": "pct", "decimals": 1, "op": ">", "limit": 80.0,
                 "value": 88.0, "ageSeconds": 0, "stale": False, "met": True}


def test_every_symptom_has_a_title_aliases_and_an_explanation_for_each_cause():
    assert set(dx.SYMPTOMS) == set(dx._ALIASES) == set(dx.EXPLAIN)
    for symptom in dx.SYMPTOMS:
        causes = {c.cause for c in dx._checks(symptom, FLOWERING)}
        assert causes == set(dx.EXPLAIN[symptom]), symptom                      # a rule can never fire without a sentence


def test_unknown_symptom_is_an_error():
    with pytest.raises(KeyError):
        dx.correlate("rust", {}, stage=None, now=NOW)


# ------------------------------------------------------------------- the routes

class StubClassifier:
    def __init__(self, result):
        self.result = result

    def classify(self, data):
        return self.result


def payload(**values):
    units = {"soil_moisture": "%", "soil_ph": "pH", "air_humidity": "%", "air_temperature": "C"}
    return {"device": "ESP-FIELD-01", "measurements": [{"metric": k, "value": v, "unit": units[k]} for k, v in values.items()]}


async def fresh(Session, **values):
    async with Session() as s:
        await store_telemetry(s, "farm/farm-01/zone/zone-a/telemetry", payload(**values), now=datetime.now(timezone.utc))


@pgdb.with_db("aaf_diag_named")
async def test_a_named_symptom_is_set_against_the_beds_live_readings(Session):
    async with Session() as s:
        await seed_stage1(s, planted_on=farm_today() - timedelta(days=49))
    await fresh(Session, soil_moisture=41.0, soil_ph=6.3)
    async with pgdb.api(Session) as c:
        assert [x["id"] for x in (await c.get(f"{V1}/diagnosis/symptoms")).json()] == list(dx.SYMPTOMS)
        got = (await c.get(f"{V1}/diagnosis?zone=zone-a&symptom=blossom_end_rot")).json()
        assert got["verdict"] == "supported" and got["source"] == "named"
        assert (got["zone"], got["label"], got["title"]) == ("zone-a", "Tomato bed A", "Blossom end rot")
        assert got["stage"] == {"key": "flowering", "title": "Flowering and fruit set", "day": 50}
        assert got["evidence"][0]["value"] == 41.0 and got["evidence"][0]["met"] is True
        quiet = (await c.get(f"{V1}/diagnosis?zone=zone-b&symptom=early_blight")).json()      # a bed with no readings
        assert quiet["verdict"] == "no_data"
        assert (await c.get(f"{V1}/diagnosis?zone=zone-a&symptom=rust")).status_code == 422
        assert (await c.get(f"{V1}/diagnosis?zone=zone-zzz&symptom=early_blight")).status_code == 404
        assert (await c.get(f"{V1}/diagnosis?zone=zone-a")).status_code == 422
        assert (await c.get(f"{V1}/diagnosis?zone=zone-a&symptom=early_blight&farm=nope")).status_code == 404


@pgdb.with_db("aaf_diag_photo")
async def test_a_photo_result_carries_the_cross_check_when_the_bed_is_named(Session):
    async with Session() as s:
        await seed_stage1(s, planted_on=farm_today() - timedelta(days=49))
    await fresh(Session, air_humidity=88.0)

    def check(c, label, zone="zone-a"):
        app.dependency_overrides[get_classifier] = lambda: StubClassifier((label, 0.93))
        q = f"?zone={zone}" if zone else ""
        return c.post(f"{V1}/photos/check{q}", files={"photo": ("leaf.jpg", JPEG, "image/jpeg")})

    try:
        async with pgdb.api(Session) as c:
            body = (await check(c, "Tomato___Early_blight")).json()
            assert body["status"] == "ok" and body["symptom"] == "early_blight"
            assert body["correlation"]["verdict"] == "supported" and body["correlation"]["source"] == "photo"
            assert "stagnant high humidity" in body["correlation"]["explanation"]

            no_bed = (await check(c, "Tomato___Early_blight", zone=None)).json()
            assert no_bed["symptom"] == "early_blight" and no_bed["correlation"] is None     # we do not know which bed

            virus = (await check(c, "Tomato___Tomato_Yellow_Leaf_Curl_Virus")).json()
            assert virus["status"] == "ok" and virus["symptom"] is None and virus["correlation"] is None

            other = (await check(c, "Tomato___Late_blight")).json()
            assert other["symptom"] is None and other["correlation"] is None

            assert (await check(c, "Tomato___Early_blight", zone="zone-zzz")).status_code == 404

            app.dependency_overrides[get_classifier] = lambda: StubClassifier(None)
            unsure = (await c.post(f"{V1}/photos/check?zone=zone-a", files={"photo": ("l.jpg", JPEG, "image/jpeg")})).json()
            assert unsure["status"] == "uncertain" and unsure["correlation"] is None
    finally:
        app.dependency_overrides.pop(get_classifier, None)
