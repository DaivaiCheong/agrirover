"""The simulated field node must speak exactly what the firmware speaks (plus the
optional probe code), and the API's ingest must accept it
(contract: esp8266_field_node.ino publishTelemetry)."""
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "edge" / "field-node-sim"))
import sim_field_node as sim  # noqa: E402

from app.workers.mqtt_ingest import readings  # noqa: E402


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
