"""Saved photos: kept with their soil and air, confirmed by a named expert, exported for scoring a model."""
import csv
import io
import tempfile
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pgdb

from app.core.config import settings
from app.services import photo_library as lib
from app.services.rover_live import store_report
from app.services.seed import seed_stage1

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64
NOW = datetime.now(timezone.utc)


def with_photos(db_name):
    """A fresh database, a seeded farm, and a throwaway photo folder."""
    def wrap(fn):
        @pgdb.with_db(db_name)
        async def body(Session):
            keep = settings.photo_dir
            with tempfile.TemporaryDirectory() as folder:
                settings.photo_dir = folder
                try:
                    async with Session() as s:
                        await seed_stage1(s)
                    await fn(Session, Path(folder))
                finally:
                    settings.photo_dir = keep
        body.__name__ = fn.__name__
        return body
    return wrap


async def add(client, zone="g1", **fields):
    return await client.post("/api/v1/photos", files={"photo": ("leaf.jpg", JPEG, "image/jpeg")}, data={"zone": zone, **fields})


@with_photos("aaf_photo_save")
async def test_a_saved_photo_keeps_its_file_block_tree_and_who_said_what(Session, folder):
    async with pgdb.api(Session) as c:
        r = await add(c, part="fruit", row="1", col="2", label="anthracnose", note=" dark spots ", modelLabel="problem", modelSeen="Dark spots.")
        assert r.status_code == 201
        p = r.json()
        assert (p["zone"], p["tree"], p["part"], p["cropDay"]) == ("g1", "R2 T3", "fruit", 30)
        assert (p["farmerLabel"], p["note"], p["modelLabel"], p["modelSeen"]) == ("anthracnose", "dark spots", "problem", "Dark spots.")
        assert p["expertLabel"] is None
        assert (folder / f"{p['id']}.jpg").read_bytes() == JPEG
        image = await c.get(f"/api/v1/photos/{p['id']}/image")
        assert image.status_code == 200 and image.content == JPEG and image.headers["content-type"] == "image/jpeg"


@with_photos("aaf_photo_readings")
async def test_it_keeps_that_trees_own_readings_and_says_they_were_simulated(Session, folder):
    at = NOW - timedelta(minutes=10)
    async with Session() as s:
        await store_report(s, {"missionId": "11111111-1111-4111-8111-111111111111", "zoneId": "g1", "status": "completed", "simulated": True, "cellsScanned": 1, "cellsTotal": 1,
                               "plantsDetected": 1, "cellsFlagged": 0, "distanceM": 0, "estDurationS": 1, "startedAt": at.isoformat(), "finishedAt": at.isoformat(),
                               "grid": {"rows": 1, "cols": 1, "cellM": 5, "rowM": 5},
                               "cells": [{"row": 0, "col": 0, "plant": True, "canopy": 0.4, "chlorosis": 0, "flagged": False, "readings": {"soil_moisture": 26.2}}]})
    async with pgdb.api(Session) as c:
        p = (await add(c, row="0", col="0")).json()
    assert p["readings"] == {"values": {"soil_moisture": 26.2}, "simulated": True}


@with_photos("aaf_photo_refuse")
async def test_it_refuses_what_it_cannot_keep_and_writes_no_file(Session, folder):
    async with pgdb.api(Session) as c:
        assert (await add(c, zone="nowhere")).status_code == 404
        assert (await add(c, part="root")).status_code == 422
        assert (await add(c, label="made_up")).status_code == 422
        assert (await add(c, row="1")).status_code == 422
        bad = await c.post("/api/v1/photos", files={"photo": ("a.jpg", b"not an image", "image/jpeg")}, data={"zone": "g1"})
        assert bad.status_code == 415
    assert list(folder.iterdir()) == []


@with_photos("aaf_photo_confirm")
async def test_only_a_named_experts_label_counts_as_confirmed(Session, folder):
    async with pgdb.api(Session) as c:
        pid = (await add(c, label="rust")).json()["id"]
        lib_ = (await c.get("/api/v1/photos")).json()
        assert (lib_["saved"], lib_["toConfirm"], lib_["confirmed"]) == (1, 1, 0)
        assert next(x for x in lib_["progress"] if x["label"] == "rust")["photos"] == 0     # the farmer's label does not count

        assert (await c.put(f"/api/v1/photos/{pid}/confirm", json={"label": "rust", "name": "   "})).status_code == 422
        assert (await c.put(f"/api/v1/photos/{pid}/confirm", json={"label": "made_up", "name": "Dr K"})).status_code == 422
        done = (await c.put(f"/api/v1/photos/{pid}/confirm", json={"label": "algal_leaf_spot", "name": "Dr K", "note": "Velvety"})).json()
        assert (done["farmerLabel"], done["expertLabel"], done["expertName"]) == ("rust", "algal_leaf_spot", "Dr K")

        after = (await c.get("/api/v1/photos?status=to_confirm")).json()
        assert after["photos"] == [] and after["confirmed"] == 1
        assert next(x for x in after["progress"] if x["label"] == "algal_leaf_spot")["photos"] == 1


def test_a_label_is_ready_only_with_enough_photos_from_enough_separate_days():
    def row(day):
        return {"expertLabel": "rust", "takenOn": f"2026-11-0{day}"}
    ready = lambda rows: next(x for x in lib.progress(rows) if x["label"] == "rust")["ready"]  # noqa: E731
    assert not ready([row(1)] * lib.TARGET_PHOTOS)                                  # plenty, but one day
    assert not ready([row(1), row(2), row(3)] * 10)                                 # three days, too few
    assert ready([row(1), row(2), row(3)] * (lib.TARGET_PHOTOS // 3 + 1))


@with_photos("aaf_photo_export")
async def test_exports_sort_confirmed_photos_by_label_and_keep_unconfirmed_out(Session, folder):
    async with pgdb.api(Session) as c:
        a = (await add(c, label="rust", note="=2+2")).json()["id"]
        b = (await add(c, zone="g2")).json()["id"]
        await c.put(f"/api/v1/photos/{a}/confirm", json={"label": "rust", "name": "Dr K"})

        done = zipfile.ZipFile(io.BytesIO((await c.get("/api/v1/photos/export.zip")).content))
        images = [n for n in done.namelist() if n.endswith(".jpg")]
        assert len(images) == 1 and images[0].startswith("rust/") and a[:8] in images[0]
        sheet = list(csv.DictReader(io.StringIO(done.read("photos.csv").decode())))
        assert sheet[0]["expert_label"] == "rust" and sheet[0]["note"] == "'=2+2"      # a spreadsheet must not run it as a formula

        review = zipfile.ZipFile(io.BytesIO((await c.get("/api/v1/photos/export.zip?status=to_confirm")).content))
        assert [n for n in review.namelist() if n.endswith(".jpg")][0].startswith("photos/") and b[:8] in review.namelist()[0]
        assert "algal_leaf_spot" in review.read("README.txt").decode()
        assert (await c.get("/api/v1/photos/export.zip?status=all")).status_code == 422


@with_photos("aaf_photo_delete")
async def test_deleting_removes_the_row_and_the_file(Session, folder):
    async with pgdb.api(Session) as c:
        pid = (await add(c)).json()["id"]
        assert (await c.delete(f"/api/v1/photos/{pid}")).status_code == 204
        assert (await c.get(f"/api/v1/photos/{pid}/image")).status_code == 404
        assert (await c.delete(f"/api/v1/photos/{pid}")).status_code == 404
    assert list(folder.iterdir()) == []
