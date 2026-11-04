"""The stage-aware agronomy engine: a pure function, so every rule is tested at its boundary.
The limits in the farm's agronomy table are strict ("> 32", "< 45"): exactly on the limit is not past it."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.services import agronomy as ag

LOCAL = ZoneInfo("Asia/Phnom_Penh")
NOON = datetime(2026, 11, 4, 12, 0, tzinfo=LOCAL)
MIDNIGHT = datetime(2026, 11, 4, 23, 30, tzinfo=LOCAL)

# The example payload of the spec (zone-a): every value inside the mid-season ranges.
EXAMPLE = {"soil_moisture": 68.2, "soil_ph": 6.35, "soil_ec": 2.45, "soil_temperature": 24.1,
           "nitrogen": 130, "phosphorus": 85, "potassium": 210, "air_temperature": 28.4, "air_humidity": 72.0}


def snap(at=NOON, **values):
    return {k: ag.Reading(float(v), at) for k, v in values.items()}


def run(values, day=50, at=NOON, now=None, crop="tomato"):
    return ag.assess(snap(at, **values), crop=crop, day=day, now=now or at)


def status(a, metric):
    return next(p for p in a.params if p.metric == metric).status


def alert_ids(a):
    return [x.id for x in a.alerts]


# ----------------------------------------------------------------- the stage table

@pytest.mark.parametrize("day,key", [
    (1, "seedling"), (25, "seedling"), (26, "vegetative"), (45, "vegetative"),
    (46, "flowering"), (70, "flowering"), (71, "fruiting"), (110, "fruiting"),
])
def test_stage_edges_follow_the_table(day, key):
    assert ag.stage_for_day(ag.TOMATO_STAGES, day).key == key


@pytest.mark.parametrize("day", [None, 0, -3])
def test_no_stage_before_planting(day):
    assert ag.stage_for_day(ag.TOMATO_STAGES, day) is None


def test_the_last_stage_goes_on_after_day_110_and_says_so():
    s = ag.stage_for_day(ag.TOMATO_STAGES, 130)
    assert s.key == "fruiting" and s.extended is True
    assert ag.stage_for_day(ag.TOMATO_STAGES, 110).extended is False


def test_stage_targets_are_the_table():
    t = {s.key: (s.moisture, s.ec) for s in ag.TOMATO_STAGES}
    assert t["seedling"] == (ag.Range(65, 75), ag.Range(1.2, 1.8))
    assert t["vegetative"] == (ag.Range(60, 75), ag.Range(1.8, 2.4))
    assert t["flowering"] == (ag.Range(65, 80), ag.Range(2.2, 3.0))
    assert t["fruiting"] == (ag.Range(50, 65), ag.Range(2.5, 3.5))


def test_the_stage_table_has_no_gaps_or_overlaps():
    days = [d for s in ag.TOMATO_STAGES for d in range(s.first_day, s.last_day + 1)]
    assert days == list(range(1, 111))


# ----------------------------------------------------------- ratings against the stage

def test_the_example_payload_is_all_normal_in_flowering():
    a = run(EXAMPLE, day=50)
    assert [p.status for p in a.params] == ["normal"] * 9
    assert a.alerts == () and a.status == "normal"


def test_the_same_readings_at_day_21_only_find_ec_above_the_seedling_target():
    a = run(EXAMPLE, day=21)
    assert [(p.metric, p.direction) for p in a.params if p.status != "normal"] == [("soil_ec", "high")]
    assert status(a, "soil_ec") == "warning" and a.status == "warning"


def test_moisture_target_moves_with_the_stage():
    # the same 60 % is low for seedlings (65-75) and flowering (65-80), right for vegetative (60-75) and fruiting (50-65)
    got = {day: status(run({"soil_moisture": 60}, day=day), "soil_moisture") for day in (10, 30, 50, 80)}
    assert got == {10: "warning", 30: "normal", 50: "warning", 80: "normal"}
    # and 52 % is fine for fruiting but under the flowering floor of 55, which lifts it to critical
    assert status(run({"soil_moisture": 52}, day=80), "soil_moisture") == "normal"
    assert status(run({"soil_moisture": 52}, day=50), "soil_moisture") == "critical"


@pytest.mark.parametrize("metric,value,expect,direction", [
    ("soil_ph", 6.0, "normal", None), ("soil_ph", 6.8, "normal", None),
    ("soil_ph", 5.9, "warning", "low"), ("soil_ph", 6.9, "warning", "high"),
    ("soil_temperature", 26.0, "normal", None), ("soil_temperature", 17.9, "warning", "low"),
    ("soil_temperature", 28.0, "warning", "high"),
    ("air_temperature", 29.0, "normal", None), ("air_temperature", 20.9, "warning", "low"),
    ("air_temperature", 31.0, "warning", "high"),
    ("air_humidity", 60.0, "normal", None), ("air_humidity", 75.0, "normal", None),
    ("air_humidity", 55.0, "warning", "low"), ("air_humidity", 80.0, "warning", "high"),
    ("nitrogen", 99, "warning", "low"), ("nitrogen", 150, "normal", None), ("nitrogen", 151, "warning", "high"),
    ("phosphorus", 59, "warning", "low"), ("phosphorus", 100, "normal", None),
    ("potassium", 149, "warning", "low"), ("potassium", 250, "normal", None), ("potassium", 251, "warning", "high"),
])
def test_generic_ranges(metric, value, expect, direction):
    a = run({metric: value}, day=50)
    p = next(p for p in a.params if p.metric == metric)
    assert (p.status, p.direction) == (expect, direction)


# ------------------------------------------------- critical lines (strictly beyond)

@pytest.mark.parametrize("metric,at_limit,past_limit,direction", [
    ("soil_temperature", 30.0, 30.1, "high"),
    ("air_temperature", 32.0, 32.1, "high"),
    ("air_humidity", 85.0, 85.1, "high"),
    ("soil_ec", 4.0, 4.01, "high"),
    ("soil_ph", 5.8, 5.79, "low"),
    ("soil_moisture", 45.0, 44.9, "low"),
])
def test_critical_only_strictly_past_the_limit(metric, at_limit, past_limit, direction):
    assert status(run({metric: at_limit}, day=10), metric) == "warning"
    p = next(p for p in run({metric: past_limit}, day=10).params if p.metric == metric)
    assert (p.status, p.direction) == ("critical", direction)


# ------------------------------------------------------------------------ alerts

def test_pollen_sterility_by_day_needs_flowering_and_more_than_32():
    assert alert_ids(run({"air_temperature": 32.0}, day=50)) == []
    a = run({"air_temperature": 32.1}, day=50)
    assert alert_ids(a) == ["pollen_sterility"]
    assert "by day" in a.alerts[0].message and "32.1" in a.alerts[0].message
    assert alert_ids(run({"air_temperature": 38.0}, day=45)) == []       # not flowering yet
    assert alert_ids(run({"air_temperature": 38.0}, day=46)) == ["pollen_sterility"]
    assert alert_ids(run({"air_temperature": 38.0}, day=100)) == ["pollen_sterility"]   # "Day 46+"


def test_pollen_sterility_at_night_needs_more_than_26():
    assert alert_ids(run({"air_temperature": 26.0}, day=50, at=MIDNIGHT)) == []
    a = run({"air_temperature": 26.1}, day=50, at=MIDNIGHT)
    assert alert_ids(a) == ["pollen_sterility"] and "at night" in a.alerts[0].message
    assert alert_ids(run({"air_temperature": 28.0}, day=50, at=NOON)) == []   # 28 C is fine at noon


@pytest.mark.parametrize("hour,day_time", [(5, False), (6, True), (17, True), (18, False)])
def test_day_runs_from_6_to_18_farm_time(hour, day_time):
    assert ag.is_daytime(datetime(2026, 11, 4, hour, 59, tzinfo=LOCAL), "Asia/Phnom_Penh") is day_time


def test_day_is_judged_in_farm_time_not_the_servers():
    utc_05 = datetime(2026, 11, 4, 5, 0, tzinfo=ZoneInfo("UTC"))             # 12:00 at the farm
    assert ag.is_daytime(utc_05, "Asia/Phnom_Penh") is True


def test_a_warm_night_lifts_the_air_reading_to_critical_although_its_range_says_normal():
    a = run({"air_temperature": 27.0}, day=50, at=MIDNIGHT)
    p = next(p for p in a.params if p.metric == "air_temperature")
    assert (p.status, p.direction) == ("critical", "high")                  # the band alone would say normal (21-29)


def test_calcium_lockup_from_dry_soil_or_acid_soil():
    assert alert_ids(run({"soil_moisture": 45.0, "soil_ph": 5.8}, day=80)) == []
    dry = run({"soil_moisture": 44.9, "soil_ph": 6.4}, day=80)
    assert alert_ids(dry) == ["calcium_lockup"] and dry.alerts[0].hits == (("soil_moisture", "low"),)
    acid = run({"soil_moisture": 60, "soil_ph": 5.79}, day=80)
    assert alert_ids(acid) == ["calcium_lockup"] and acid.alerts[0].hits == (("soil_ph", "low"),)
    assert status(acid, "soil_moisture") == "normal"                       # only the reading that crossed is lifted


def test_calcium_lockup_message_names_both_causes_and_keeps_ph_spelled_right():
    a = run({"soil_moisture": 40, "soil_ph": 5.5}, day=80)
    msg = a.alerts[0].message
    assert msg.startswith("Soil moisture 40.0 % is below 45 %") and "soil pH 5.50 is below 5.8" in msg


def test_fungal_window_needs_humidity_and_warmth_together():
    assert alert_ids(run({"air_humidity": 85.0, "air_temperature": 25}, day=10)) == []
    assert alert_ids(run({"air_humidity": 90, "air_temperature": 22.0}, day=10)) == []
    a = run({"air_humidity": 85.1, "air_temperature": 22.1}, day=10)
    assert alert_ids(a) == ["fungal_window"]
    # humidity is the culprit and is lifted; 22.1 C is a normal air temperature and stays normal
    assert status(a, "air_humidity") == "critical" and status(a, "air_temperature") == "normal"
    # humidity alone is critical for the reading (high fungal risk) but is not an alert
    cool = run({"air_humidity": 90, "air_temperature": 20.0}, day=10)
    assert status(cool, "air_humidity") == "critical" and cool.alerts == ()


def test_salinity_and_root_heat():
    assert alert_ids(run({"soil_ec": 4.0, "soil_temperature": 30.0}, day=10)) == []
    assert alert_ids(run({"soil_ec": 4.01}, day=10)) == ["salinity"]
    assert alert_ids(run({"soil_temperature": 30.1}, day=10)) == ["root_heat"]


def test_flowering_never_below_55_percent():
    assert alert_ids(run({"soil_moisture": 55.0}, day=50)) == []
    a = run({"soil_moisture": 54.9}, day=50)
    assert alert_ids(a) == ["flowering_moisture_floor"]
    assert alert_ids(run({"soil_moisture": 52}, day=80)) == []              # fruiting wants it drier: no floor
    assert alert_ids(run({"soil_moisture": 52}, day=30)) == []              # the floor is for flowering only


def test_flowering_floor_alone_from_45_to_55_and_with_calcium_lockup_below_45():
    assert alert_ids(run({"soil_moisture": 50}, day=50)) == ["flowering_moisture_floor"]
    assert alert_ids(run({"soil_moisture": 40}, day=50)) == ["calcium_lockup", "flowering_moisture_floor"]


def test_every_alert_is_critical():
    a = run({"air_temperature": 40, "soil_moisture": 30, "soil_ec": 5, "soil_temperature": 35, "air_humidity": 95}, day=50)
    assert {x.id for x in a.alerts} == {"pollen_sterility", "calcium_lockup", "fungal_window", "salinity",
                                        "root_heat", "flowering_moisture_floor"}
    assert {x.severity for x in a.alerts} == {"critical"} and a.status == "critical"


# ---------------------------------------------------------- old readings and gaps

def test_a_reading_older_than_30_minutes_is_shown_but_not_rated_and_raises_no_alert():
    old_at = NOON - timedelta(minutes=30, seconds=1)
    a = ag.assess(snap(old_at, air_temperature=40.0), crop="tomato", day=50, now=NOON)
    p = next(p for p in a.params if p.metric == "air_temperature")
    assert (p.status, p.value) == ("stale", 40.0) and a.alerts == () and a.status == "stale"


def test_exactly_30_minutes_old_is_still_fresh():
    a = ag.assess(snap(NOON - timedelta(minutes=30), air_temperature=40.0), crop="tomato", day=50, now=NOON)
    assert alert_ids(a) == ["pollen_sterility"]                             # 11:30 is daytime, 40 C is above 32
    assert status(a, "air_temperature") == "critical"


def test_a_missing_reading_is_no_data_and_the_rest_are_still_rated():
    a = run({"soil_moisture": 70}, day=50)
    assert status(a, "soil_moisture") == "normal" and status(a, "soil_ph") == "no_data"
    assert a.status == "normal"


def test_no_readings_at_all():
    a = ag.assess({}, crop="tomato", day=10, now=NOON)
    assert a.status == "no_data" and all(p.value is None for p in a.params) and a.alerts == ()


# -------------------------------------------------------- idle bed and other crops

def test_nothing_planted_uses_the_general_ranges_and_raises_no_alert():
    a = ag.assess(snap(NOON, soil_moisture=60, air_temperature=40, soil_ec=2.0), crop=None, day=None, now=NOON)
    assert a.stage is None and a.alerts == () and a.rated
    assert status(a, "soil_moisture") == "normal"                       # general 50-80
    assert status(a, "air_temperature") == "critical"                   # the reading's own line still applies
    assert next(p for p in a.params if p.metric == "soil_ec").target == (1.5, 3.5)


def test_before_planting_counts_as_nothing_planted():
    a = ag.assess(snap(NOON, air_temperature=40), crop="tomato", day=-4, now=NOON)
    assert a.stage is None and a.alerts == ()


def test_a_crop_without_a_table_is_shown_not_rated():
    a = ag.assess(snap(NOON, soil_moisture=20, air_temperature=40), crop="cucumber", day=30, now=NOON)
    assert not a.rated and a.alerts == () and a.stage is None
    assert status(a, "soil_moisture") == "unrated" and status(a, "soil_ph") == "no_data"
    assert a.status == "unrated" and all(p.target is None for p in a.params)


# --------------------------------------------------------------------- the shape

def test_to_dict_is_the_documented_shape():
    d = run({"soil_moisture": 44.0, "air_temperature": 33.0}, day=50).to_dict()
    assert d["basis"] == "spec" and d["status"] == "critical" and d["rated"] is True
    assert d["stage"]["key"] == "flowering" and d["stage"]["moisture"] == [65, 80] and d["stage"]["firstDay"] == 46
    assert [p["metric"] for p in d["params"]] == [
        "soil_moisture", "soil_ph", "soil_ec", "soil_temperature", "nitrogen", "phosphorus", "potassium",
        "air_temperature", "air_humidity"]
    m = d["params"][0]
    assert m["short"] == "Moisture" and m["unit"] == "pct" and m["target"] == [65, 80]
    assert m["status"] == "critical" and m["direction"] == "low" and m["recordedAt"].startswith("2026-11-04T12:00")
    assert {a["id"] for a in d["alerts"]} == {"pollen_sterility", "calcium_lockup", "flowering_moisture_floor"}
    assert d["alerts"][0].keys() == {"id", "severity", "title", "message", "metrics"}


def test_it_is_pure_the_same_input_gives_the_same_answer_and_the_input_is_left_alone():
    readings = snap(NOON, **{**EXAMPLE, "air_humidity": 90})
    before = dict(readings)
    first = ag.assess(readings, crop="tomato", day=50, now=NOON)
    assert ag.assess(readings, crop="tomato", day=50, now=NOON) == first
    assert readings == before
