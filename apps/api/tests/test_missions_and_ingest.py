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
    r = client.post("/api/v1/missions", json={"zoneId": "g1", "rows": 4, "cols": 10})
    assert r.status_code == 202 and r.json()["status"] == "queued"
    topic, payload = sent[0]
    assert topic == TOPIC_MISSION_SET
    assert payload == {"missionId": r.json()["missionId"], "zoneId": "g1",
                       "rows": 4, "cols": 10, "cellM": 3.0, "rowM": 3.0, "start": "sw", "along": "rows"}
    app.dependency_overrides.clear()


def test_the_route_set_on_the_map_goes_to_the_rover_and_into_the_live_round():
    app.dependency_overrides[get_publisher] = lambda: fake_publish
    sent.clear()
    r = client.post("/api/v1/missions", json={"zoneId": "g1", "rows": 3, "cols": 5, "start": "ne", "along": "across"})
    assert r.status_code == 202
    assert sent[0][1]["start"] == "ne" and sent[0][1]["along"] == "across"
    m = live.snapshot()["mission"]
    assert m["start"] == "ne" and m["along"] == "across"
    app.dependency_overrides.clear()


def test_a_round_on_a_plant_map_stops_at_the_plants_only():
    app.dependency_overrides[get_publisher] = lambda: fake_publish
    sent.clear()
    r = client.post("/api/v1/missions", json={"zoneId": "t1", "rows": 2, "cols": 3, "cellM": 0.5, "rowM": 0.8,
                                              "stops": [[1, 1], [0, 0], [0, 2], [0, 0]]})
    assert r.status_code == 202
    assert sent[0][1]["stops"] == [[0, 0], [0, 2], [1, 1]]                  # one stop a spot, in a steady order
    m = live.snapshot()["mission"]
    assert m["stops"] == [[0, 0], [0, 2], [1, 1]] and m["cellsTotal"] == 3
    for bad in ([[2, 0]], [[0, 3]], []):                                     # off the grid, or no plant at all
        assert client.post("/api/v1/missions", json={"zoneId": "t1", "rows": 2, "cols": 3, "stops": bad}).status_code == 422
    app.dependency_overrides.clear()


def test_a_round_adopted_after_a_restart_keeps_its_route():
    live.on_state({"missionId": "m-1", "status": "running", "zoneId": "g1", "rows": 2, "cols": 2, "cellM": 1.0, "rowM": 1.0,
                   "start": "nw", "along": "across", "cell": [1, 0]})
    assert (live.mission["start"], live.mission["along"]) == ("nw", "across")
    live.reset()
    live.on_state({"missionId": "m-2", "status": "running", "zoneId": "g1", "rows": 2, "cols": 2, "start": "up", "along": 3})
    assert (live.mission["start"], live.mission["along"]) == ("sw", "rows")     # an older or odd rover: the default route


def test_oversized_or_invalid_missions_are_refused():
    app.dependency_overrides[get_publisher] = lambda: fake_publish
    for body in ({"zoneId": "g1", "rows": 30, "cols": 30},
                 {"zoneId": "g1", "rows": 0, "cols": 3},
                 {"zoneId": "g1", "rows": 2, "cols": 2, "cellM": 11},
                 {"zoneId": "g1", "rows": 2, "cols": 2, "start": "middle"},
                 {"zoneId": "g1", "rows": 2, "cols": 2, "along": "diagonal"},
                 {"rows": 2, "cols": 2}):
        assert client.post("/api/v1/missions", json=body).status_code == 422
    app.dependency_overrides.clear()


def test_broker_down_is_a_503_not_a_silent_success():
    app.dependency_overrides[get_publisher] = lambda: broker_down
    r = client.post("/api/v1/missions", json={"zoneId": "g1", "rows": 2, "cols": 2})
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
