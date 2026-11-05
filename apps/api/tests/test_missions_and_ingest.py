import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers.missions import TOPIC_MISSION_SET, get_publisher
from app.services.rover_live import live
from app.workers.mqtt_ingest import readings

sent: list[tuple[str, dict]] = []


async def fake_publish(topic: str, payload: dict) -> None:
    sent.append((topic, payload))


async def broker_down(topic: str, payload: dict) -> None:
    raise OSError("connection refused")


client = TestClient(app)        # no `with`: the MQTT ingest lifespan is not started


@pytest.fixture(autouse=True)
def rover_is_idle():
    live.reset()               # a mission queued by one test must not block the next
    yield
    live.reset()


def test_mission_is_published_to_the_rover():
    app.dependency_overrides[get_publisher] = lambda: fake_publish
    sent.clear()
    r = client.post("/api/v1/missions", json={"zoneId": "zone-a", "rows": 4, "cols": 10})
    assert r.status_code == 202 and r.json()["status"] == "queued"
    topic, payload = sent[0]
    assert topic == TOPIC_MISSION_SET
    assert payload == {"missionId": r.json()["missionId"], "zoneId": "zone-a",
                       "rows": 4, "cols": 10, "cellM": 0.5}
    app.dependency_overrides.clear()


def test_oversized_or_invalid_missions_are_refused():
    app.dependency_overrides[get_publisher] = lambda: fake_publish
    for body in ({"zoneId": "zone-a", "rows": 30, "cols": 30},
                 {"zoneId": "zone-a", "rows": 0, "cols": 3},
                 {"zoneId": "zone-a", "rows": 2, "cols": 2, "cellM": 3},
                 {"rows": 2, "cols": 2}):
        assert client.post("/api/v1/missions", json=body).status_code == 422
    app.dependency_overrides.clear()


def test_broker_down_is_a_503_not_a_silent_success():
    app.dependency_overrides[get_publisher] = lambda: broker_down
    r = client.post("/api/v1/missions", json={"zoneId": "zone-a", "rows": 2, "cols": 2})
    assert r.status_code == 503
    app.dependency_overrides.clear()


def test_field_node_batch_telemetry_is_accepted():
    # Exactly what esp8266_field_node.ino publishes.
    batch = {"device": "ESP-FIELD-01", "fw": "field-node-1.0.0", "sampleCount": 24, "rssi": -61,
             "measurements": [
                 {"metric": "soil_moisture", "value": 27.4, "unit": "pct", "quality": "valid"},
                 {"metric": "water_ph", "value": 7.1, "unit": "pH", "quality": "uncalibrated"},
                 {"metric": "rain", "value": 0, "unit": "bool", "quality": "valid"},
                 {"metric": "supply_voltage", "value": None, "unit": "V", "quality": "valid"},
             ]}
    assert [m["metric"] for m in readings(batch)] == ["soil_moisture", "water_ph", "rain"]
    assert readings({"metric": "rain", "value": 1}) == [{"metric": "rain", "value": 1}]
    assert readings(["not", "telemetry"]) == []
