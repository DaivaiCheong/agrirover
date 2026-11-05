"""The simulated field node must speak exactly what the firmware speaks (plus the
optional probe code), and the API's ingest must accept it
(contract: esp8266_field_node.ino publishTelemetry)."""
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "edge" / "field-node-sim"))
import sim_field_node as sim  # noqa: E402

from app.services.metrics import clean  # noqa: E402
from app.workers.mqtt_ingest import readings  # noqa: E402

EIGHT = {"soil_ph", "soil_ec", "soil_temperature", "nitrogen", "phosphorus", "potassium",
         "air_temperature", "air_humidity"}


def metrics(payload):
    """Non-soil metrics are unique per payload."""
    return {m["metric"]: m for m in payload["measurements"] if m["metric"] != "soil_moisture"}


def soil(payload):
    """{probe code: moisture %}"""
    return {m["sensor"]: m["value"] for m in payload["measurements"] if m["metric"] == "soil_moisture"}


def test_topic_matches_firmware_layout():
    assert sim.telemetry_topic("farm-01", "zone-a") == "farm/farm-01/zone/zone-a/telemetry"


@pytest.mark.parametrize("scenario", ["dry", "wet", "rain"])
def test_payload_is_accepted_by_the_api_ingest(scenario):
    p = sim.build_payload(scenario, random.Random(1))
    assert {"device", "fw", "sampleCount", "rssi", "measurements"} <= p.keys()
    good = readings(p)
    assert len(good) == 5 == len(p["measurements"])          # nothing dropped
    assert set(metrics(p)) == {"water_ph", "rain", "supply_voltage"}
    assert set(soil(p)) == {"S-A-10", "S-A-25"}              # two depths


def test_probe_codes_follow_the_zone_letter():
    assert set(soil(sim.build_payload("dry", random.Random(1), zone="zone-b"))) == {"S-B-10", "S-B-25"}


def test_scenarios_drive_the_deciding_probe_and_the_rain_flag():
    rng = random.Random(7)
    dry, wet, rain = (sim.build_payload(s, rng) for s in ("dry", "wet", "rain"))
    assert soil(dry)["S-A-25"] < 30 <= soil(wet)["S-A-25"]   # default threshold 30
    assert metrics(dry)["rain"]["value"] == 0 and metrics(wet)["rain"]["value"] == 0
    assert metrics(rain)["rain"]["value"] == 1
    assert all(0 <= v <= 100 for p in (dry, wet, rain) for v in soil(p).values())


def test_unknown_scenario_is_refused():
    with pytest.raises(ValueError):
        sim.build_payload("flood", random.Random(0))


def test_unknown_probe_is_refused():
    with pytest.raises(ValueError):
        sim.build_payload("dry", random.Random(0), probe="9in1")


# ------------------------------------------------- the 7-in-1 probe and the air sensor

def test_the_basic_profile_is_still_exactly_what_the_firmware_sends_today():
    p = sim.build_payload("dry", random.Random(1))
    assert len(p["measurements"]) == 5 and "zone" not in p and p["fw"] == "sim-1.0"


@pytest.mark.parametrize("scenario", sorted(sim.SCENARIOS))
def test_the_7in1_profile_adds_the_eight_readings_and_ingest_accepts_every_one(scenario):
    p = sim.build_payload(scenario, random.Random(3), probe="7in1")
    assert set(metrics(p)) == {"water_ph", "rain", "supply_voltage"} | EIGHT
    assert p["zone"] == "zone-a"                                 # like the spec's payload, which names its zone
    assert len(readings(p)) == len(p["measurements"]) == 13
    for m in p["measurements"]:
        clean(m)                                                 # raises Refused if the sim says something ingest would drop


def test_the_7in1_profile_uses_the_units_of_the_spec():
    got = {m["metric"]: m["unit"] for m in sim.build_payload("wet", random.Random(3), probe="7in1")["measurements"]
           if m["metric"] != "soil_moisture"}
    assert got["soil_ec"] == "mS/cm" and got["nitrogen"] == "mg/kg" and got["air_humidity"] == "%"
    assert got["soil_ph"] == "pH" and got["soil_temperature"] == got["air_temperature"] == "C"


def test_the_7in1_payload_follows_the_zone():
    p = sim.build_payload("wet", random.Random(3), zone="zone-b", probe="7in1")
    assert p["zone"] == "zone-b" and set(soil(p)) == {"S-B-10", "S-B-25"}


def test_the_rain_profile_leaves_the_soil_to_the_rover():
    payload = sim.build_payload("rain", random.Random(1), zone="g1", probe="rain")
    metrics = [m["metric"] for m in payload["measurements"]]
    assert "soil_moisture" not in metrics and "rain" in metrics
    assert next(m for m in payload["measurements"] if m["metric"] == "rain")["value"] == 1
