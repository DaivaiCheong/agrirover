"""Plant Inspection: every plant's photo checked on a round, and one report of the round for Rover and Plant health."""
import base64
import tempfile
import uuid
from datetime import datetime, timedelta, timezone

import pgdb

from app.core.config import settings
from app.services import rover_photos
from app.services.crop_guides import GUAVA, TOMATO, kind_of
from app.services.disease import Seen
from app.services.rover_live import live, store_report

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


class Stub:
    def __init__(self, *results):
        self.results = list(results)

    def classify(self, data, guide=None):
        return self.results.pop(0)


def state(row, col, **over) -> dict:
    s = {"missionId": "m", "status": "running", "zoneId": "t1", "simulated": False, "inspect": True,
         "observation": {"row": row, "col": col, "plant": True, "flagged": False}, "photo": base64.b64encode(JPEG).decode()}
    return {**s, **over}


def test_an_inspection_round_checks_plants_that_are_not_yellow_too():
    assert rover_photos.wanted(state(0, 0), simulated_too=False)                                  # inspect: every plant
    assert not rover_photos.wanted(state(0, 0, inspect=False), simulated_too=False)               # otherwise yellow only
    # a rehearsal: simulated wheels, but real leaf pictures from a folder
    assert rover_photos.wanted(state(0, 0, simulated=True, photosReal=True), simulated_too=False)
    assert not rover_photos.wanted(state(0, 0, simulated=True), simulated_too=False)


def test_each_finding_says_what_kind_of_problem_it_is():
    assert [kind_of(TOMATO, x) for x in ("early_blight", "tylcv", "whitefly", "blossom_end_rot", "healthy", "problem", None)] == \
        ["disease", "disease", "pest", "nutrient", "healthy", "problem", "unsure"]
    assert kind_of(GUAVA, "rust") == "disease" and kind_of(TOMATO, "made_up") == "problem"
    f = rover_photos.finding(TOMATO, "early_blight", "septoria", "Ringed brown spots.", "p1")
    assert (f["title"], f["kind"], f["also"]) == ("Possible early blight", "disease", "Septoria leaf spot")
    assert f["card"]["steps"] and f["card"]["do"] and f["card"]["id"] == "early_blight"
    assert rover_photos.finding(TOMATO, "healthy", None, None, None)["card"] is None


@pgdb.with_db("aaf_inspections")
async def test_the_report_follows_the_round_live_then_stored(Session):
    from app.services.seed import seed_stage1, seed_tomato_demo
    async with Session() as s:
        await seed_stage1(s, beds=())
    async with Session() as s:
        await seed_tomato_demo(s)
    saved_dir, settings.photo_dir = settings.photo_dir, tempfile.mkdtemp()
    mid = str(uuid.uuid4())
    live.reset()
    try:
        live.queued(mid, "t1", 5, 20, 0.5, 1.0, None, stops=[[0, 0], [0, 1], [0, 2]], inspect=True, look="left")
        live.on_state({"missionId": mid, "status": "running", "zoneId": "t1", "simulated": False, "cell": [0, 1],
                       "observation": {"row": 0, "col": 0, "plant": True, "flagged": False, "canopy": 0.4, "chlorosis": 0.0}})
        stub = Stub(Seen("healthy", None, "Clean green leaf."), Seen("early_blight", None, "Ringed brown spots.", "septoria"))
        for row, col in ((0, 0), (0, 1)):
            await rover_photos.keep_and_check(state(row, col, missionId=mid), classifier=stub, session_factory=Session)

        async with pgdb.api(Session) as c:
            r = (await c.get("/api/v1/inspections/t1")).json()
            assert r["live"] is True and r["missionId"] == mid and r["crop"] == "tomato" and r["inspect"] is True
            assert r["summary"] == {"inspected": 2, "healthy": 1, "disease": 1, "nutrient": 0, "pest": 0, "problem": 0, "unsure": 0, "problems": 1}
            blight = next(p for p in r["plants"] if p["name"] == "R1 T2")
            assert blight["finding"]["title"] == "Possible early blight" and blight["finding"]["photoId"]
            assert live.snapshot()["mission"]["look"] == "left"

            # the round ends and its report is stored: the report now reads the stored round, photos joined by mission
            now = datetime.now(timezone.utc)
            report = {"missionId": mid, "zoneId": "t1", "status": "completed", "simulated": False, "cellsScanned": 3,
                      "plantsDetected": 3, "cellsFlagged": 0, "startedAt": (now - timedelta(minutes=3)).isoformat(), "finishedAt": now.isoformat(),
                      "grid": {"rows": 5, "cols": 20, "cellM": 0.5, "rowM": 1.0},
                      "cells": [{"row": 0, "col": c, "plant": True, "flagged": False, "canopy": 0.4, "chlorosis": 0.0, "readings": {}} for c in range(3)]}
            async with Session() as s:
                assert await store_report(s, report)
            live.on_state({**report, "status": "completed"})
            r = (await c.get("/api/v1/inspections/t1")).json()
            assert r["live"] is False and r["status"] == "completed" and len(r["plants"]) == 3
            assert [p["finding"]["kind"] if p["finding"] else None for p in r["plants"]] == ["healthy", "disease", None]
            assert r["summary"]["inspected"] == 2 and r["summary"]["problems"] == 1
            assert (await c.get("/api/v1/inspections/nope")).status_code == 404
    finally:
        settings.photo_dir = saved_dir
        live.reset()


def test_a_round_asks_the_rover_to_inspect_and_turn():
    from fastapi.testclient import TestClient

    from app.main import app
    from app.routers.missions import get_publisher
    sent = []

    async def publish(topic, payload):
        sent.append(payload)

    app.dependency_overrides[get_publisher] = lambda: publish
    live.reset()
    try:
        c = TestClient(app)
        r = c.post("/api/v1/missions", json={"zoneId": "t1", "rows": 1, "cols": 3, "stops": [[0, 0]], "inspect": True, "look": "left"})
        assert r.status_code == 202 and sent[0]["inspect"] is True and sent[0]["look"] == "left"
        live.reset()
        assert c.post("/api/v1/missions", json={"zoneId": "t1", "rows": 1, "cols": 3, "look": "up"}).status_code == 422
        c.post("/api/v1/missions", json={"zoneId": "t1", "rows": 1, "cols": 3})
        assert "inspect" not in sent[-1] and "look" not in sent[-1]                       # an older rover sees no new fields
    finally:
        app.dependency_overrides.clear()
        live.reset()
