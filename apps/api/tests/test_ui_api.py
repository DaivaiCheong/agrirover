"""API behind the web pages: devices registry, live zone readings, photo check."""
import asyncio
import base64
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
import pgdb
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base, get_db
from app.main import app
from app.routers import devices as devices_router
from app.routers import photos as photos_router
from app.routers import zones as zones_router
from app.services import registry as reg
from app.services.disease import ModelUnavailable, OllamaClassifier, Seen, get_classifier
from app.services.seed import seed_stage1
from app.workers.mqtt_ingest import store_telemetry

AT_6 = datetime(2026, 11, 4, 6, 0, tzinfo=ZoneInfo("Asia/Phnom_Penh")).astimezone(timezone.utc)


# ------------------------------------------------------------- device status

def test_device_status_follows_the_expected_interval():
    assert reg.device_status(None, 60, True, AT_6) == "never"
    assert reg.device_status(AT_6 - timedelta(seconds=100), 60, True, AT_6) == "online"   # < 3 x interval
    assert reg.device_status(AT_6 - timedelta(seconds=200), 60, True, AT_6) == "stale"
    assert reg.device_status(AT_6, 60, False, AT_6) == "not_commissioned"


# ------------------------------------------------ routes (services stubbed)

@pytest.fixture()
def client():
    async def no_db():
        yield None
    app.dependency_overrides[get_db] = no_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_devices_route_shape(client, monkeypatch):
    async def fake(session, now=None):
        return [{"code": "ESP-FIELD-01", "kind": "field_node", "zone": None, "commissioned": True,
                 "status": "online", "lastSeenAt": "2026-11-04T06:00:00Z", "firmwareVersion": "sim-1.0"}]
    monkeypatch.setattr(devices_router, "list_devices", fake)
    r = client.get("/api/v1/devices")
    assert r.status_code == 200 and r.json()[0]["status"] == "online"


def test_zones_route_shape(client, monkeypatch):
    async def fake(session, farm_name):
        return [{"zone": "g1", "label": "G1 Wide orchard", "moisturePct": 20.0, "rain": False, "supplyVoltage": None,
                 "waterPh": None, "recordedAt": "2026-11-04T06:00:00Z"}]
    monkeypatch.setattr(zones_router, "latest_by_zone", fake)
    assert client.get("/api/v1/zones").json()[0]["moisturePct"] == 20.0


# ------------------------------------------------------------ photo check

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64


class StubClassifier:
    def __init__(self, result):
        self.result = result

    def classify(self, data: bytes):
        return self.result


def _post(client, data=JPEG, classifier=None):
    app.dependency_overrides[get_classifier] = lambda: classifier
    return client.post("/api/v1/photos/check", files={"photo": ("leaf.jpg", data, "image/jpeg")})


def test_photo_check_without_a_model_says_so_instead_of_guessing(client):
    r = _post(client, classifier=None)
    assert r.status_code == 503 and "not installed" in r.json()["detail"]


def test_photo_check_returns_a_triage_result(client):
    r = _post(client, classifier=StubClassifier(Seen("leaf_blight", 0.93)))
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["label"] == "leaf_blight" and body["confidence"] == 0.93
    assert "not a diagnosis" in body["note"]


def test_a_language_model_reports_what_it_saw_and_no_invented_percentage(client):
    body = _post(client, classifier=StubClassifier(Seen("rust", None, "Orange powder on young leaves."))).json()
    assert body["confidence"] is None and body["seen"] == "Orange powder on young leaves." and body["symptom"] == "rust"


def test_a_model_that_is_down_says_so_rather_than_guessing(client):
    class Down:
        def classify(self, data):
            raise ModelUnavailable("cannot reach the disease model at http://x")
    r = _post(client, classifier=Down())
    assert r.status_code == 503 and "cannot reach" in r.json()["detail"]


class _Res:
    def __init__(self, status, content="{}"):
        self.status_code, self._content = status, content

    def json(self):
        return {"message": {"content": self._content}}


def _gemma(status=200, content='{"seen": "Dark sunken spots on the fruit.", "label": "problem"}', sent=None):
    def post(url, json, timeout):
        if sent is not None:
            sent.update(json, url=url)
        return _Res(status, content)
    return OllamaClassifier("http://farm:11434/", "gemma4", post=post)


def test_gemma_is_sent_the_photo_and_held_to_the_labels():
    sent = {}
    seen = _gemma(sent=sent).classify(JPEG)
    assert seen == Seen("problem", None, "Dark sunken spots on the fruit.")
    assert sent["url"] == "http://farm:11434/api/chat" and sent["model"] == "gemma4" and sent["options"]["temperature"] == 0
    assert sent["messages"][0]["images"] == [base64.b64encode(JPEG).decode()]
    # it named diseases wrongly on real photos, so it cannot be asked to
    assert sent["format"]["properties"]["label"]["enum"] == ["healthy", "problem", "unsure"]


def test_gemmas_problem_never_picks_a_symptom_or_triggers_advice(client):
    body = _post(client, classifier=_gemma()).json()
    assert body["label"] == "problem" and body["symptom"] is None and body["correlation"] is None
    assert body["seen"] == "Dark sunken spots on the fruit." and body["confidence"] is None


def test_gemma_being_unsure_is_not_a_label():
    assert _gemma(content='{"seen": "Too dark.", "label": "unsure"}').classify(JPEG) is None


@pytest.mark.parametrize("status,content,word", [(404, "{}", "not installed"), (500, "{}", "answered 500"), (200, "not json", "could not be read")])
def test_gemma_failures_become_a_plain_error(status, content, word):
    with pytest.raises(ModelUnavailable, match=word):
        _gemma(status, content).classify(JPEG)


def test_gemma_being_unreachable_is_a_plain_error():
    def post(url, json, timeout):
        raise httpx.ConnectError("refused")
    with pytest.raises(ModelUnavailable, match="cannot reach"):
        OllamaClassifier("http://farm:11434", "gemma4", post=post).classify(JPEG)


def test_photo_check_below_threshold_is_uncertain_not_a_label(client):
    body = _post(client, classifier=StubClassifier(None)).json()
    assert body["status"] == "uncertain" and body["label"] is None


def test_photo_check_rejects_non_images_and_huge_files(client):
    ok = StubClassifier(Seen("healthy", 0.99))
    assert _post(client, b"not an image", ok).status_code == 415
    assert _post(client, JPEG + b"0" * (photos_router.MAX_BYTES + 1), ok).status_code == 413


# ------------------------------------------------ integration (Postgres)

def test_registry_and_zone_readings_come_from_stored_telemetry():
    url = pgdb.require("aaf_ui_api")

    async def go():
        engine = create_async_engine(url)
        async with engine.begin() as c:
            await c.run_sync(Base.metadata.create_all)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session() as s:
                await seed_stage1(s)
            payload = {"device": "ESP-FIELD-01", "fw": "sim-1.0", "sampleCount": 16, "measurements": [
                {"metric": "soil_moisture", "value": 20.0, "unit": "pct", "quality": "valid"},
                {"metric": "rain", "value": 1, "unit": "bool", "quality": "valid"},
                {"metric": "supply_voltage", "value": 5.02, "unit": "V", "quality": "valid"}]}
            async with Session() as s:
                await store_telemetry(s, "farm/farm-01/zone/g1/telemetry", payload, now=AT_6)

            async with Session() as s:
                devices = {d["code"]: d for d in await reg.list_devices(s, now=AT_6 + timedelta(seconds=30))}
            assert devices["ESP-FIELD-01"]["status"] == "online"
            assert devices["ESP-FIELD-01"]["firmwareVersion"] == "sim-1.0"
            assert devices["ROVER-01"]["status"] == "not_commissioned"

            async with Session() as s:
                zones = {z["zone"]: z for z in await reg.latest_by_zone(s, "farm-01")}
            assert zones["g1"]["moisturePct"] == 20.0 and zones["g1"]["rain"] is True
            assert zones["g1"]["label"] == "G1 Wide orchard"
            assert zones["g1"]["supplyVoltage"] == 5.02 and zones["g1"]["waterPh"] is None
            assert zones["g2"]["moisturePct"] is None and zones["g2"]["recordedAt"] is None
        finally:
            await engine.dispose()

    asyncio.run(go())


# ------------------------------------------------------------ server errors

def test_a_crash_in_a_route_is_a_readable_500_with_cors_so_the_browser_can_show_it():
    """A bare 500 has no CORS header; the browser then says "Failed to fetch", which reads as "server down"."""
    async def broken_db():
        raise RuntimeError("column planting.setup does not exist")
        yield

    app.dependency_overrides[get_db] = broken_db
    try:
        r = TestClient(app).get("/api/v1/cycles", headers={"Origin": "http://localhost:5173"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 500
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "farm server had an error" in r.json()["detail"]
    assert "column" not in r.text                       # the detail stays in the log, not on the screen
