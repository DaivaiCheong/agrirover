"""The simulated field node must speak exactly what the firmware speaks, and
the API's ingest must accept it (contract: esp8266_field_node.ino publishTelemetry)."""
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "edge" / "field-node-sim"))
import sim_field_node as sim  # noqa: E402

from app.workers.mqtt_ingest import readings  # noqa: E402


def metrics(payload):
    return {m["metric"]: m for m in payload["measurements"]}


def test_topic_matches_firmware_layout():
    assert sim.telemetry_topic("farm-01", "zone-a") == "farm/farm-01/zone/zone-a/telemetry"


@pytest.mark.parametrize("scenario", ["dry", "wet", "rain"])
def test_payload_is_accepted_by_the_api_ingest(scenario):
    p = sim.build_payload(scenario, random.Random(1))
    assert {"device", "fw", "sampleCount", "rssi", "measurements"} <= p.keys()
    good = readings(p)
    assert len(good) == 4 == len(p["measurements"])          # nothing dropped
    assert set(metrics(p)) == {"soil_moisture", "water_ph", "rain", "supply_voltage"}


def test_scenarios_drive_the_values_the_rule_engine_cares_about():
    rng = random.Random(7)
    dry = metrics(sim.build_payload("dry", rng))
    wet = metrics(sim.build_payload("wet", rng))
    rain = metrics(sim.build_payload("rain", rng))
    assert dry["soil_moisture"]["value"] < 30 <= wet["soil_moisture"]["value"]   # default threshold 30
    assert dry["rain"]["value"] == 0 and wet["rain"]["value"] == 0
    assert rain["rain"]["value"] == 1
    assert all(0 <= m["soil_moisture"]["value"] <= 100 for m in (dry, wet, rain))


def test_unknown_scenario_is_refused():
    with pytest.raises(ValueError):
        sim.build_payload("flood", random.Random(0))
