"""Tomato photos: the tomato disease guide, and the rover's flagged plants kept, checked and shown on the map."""
import base64
import tempfile

import pgdb
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.main import app
from app.models.entities import PlantPhoto
from app.services import rover_photos
from app.services.crop_guides import GUAVA, TOMATO, guide_for
from app.services.disease import ModelUnavailable, Seen, get_classifier, match_prompt, match_schema, screen_prompt
from app.services.photo_library import LABELS
from app.services.rover_live import RoverLive
from app.services.tomato_diseases import CARDS, DISEASES, SOURCES

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
client = TestClient(app)


class Stub:
    def __init__(self, result=None, fail=False):
        self.result, self.fail, self.guide = result, fail, None

    def classify(self, data, guide=None):
        self.guide = guide
        if self.fail:
            raise ModelUnavailable("the online model's usage limit is reached: try again later")
        return self.result


# ---------------------------------------------------------------- the guide


def test_the_tomato_prompts_ask_about_tomato_and_offer_only_tomato_entries():
    screen, match = screen_prompt(TOMATO), match_prompt(TOMATO)
    assert "tomato leaf or fruit" in screen and "guava" not in screen.lower()
    assert "early_blight" in match and "anthracnose" not in match
    assert set(match_schema(TOMATO)["properties"]["label"]["enum"]) == {*TOMATO.by_id, "unsure"}
    # guava's prompt is the one that was measured: it must not change
    assert "Natural speckles on guava skin are fine." in screen_prompt(GUAVA)


def test_the_guide_covers_the_tropical_problems_and_names_no_dose():
    ids = {d.id for d in DISEASES}
    assert {"early_blight", "late_blight", "septoria", "bacterial_spot", "tylcv", "wilt", "blossom_end_rot", "whitefly"} <= ids
    assert set(CARDS) == ids and all(d.sources and all(s in SOURCES for s in d.sources) for d in DISEASES)
    assert not any(ch in d.do for d in DISEASES for ch in ("ml/", "g/L", "ppm"))
    for d in DISEASES:
        card = d.to_dict()["card"]
        assert 0 < len(card["signs"].split()) <= 8, d.id
        assert 1 <= len(card["steps"]) <= 3 and all(len(s.split()) <= 8 for s in card["steps"]), d.id
    assert "cut the stem" in TOMATO.by_id["wilt"].not_to_confuse.lower()          # a photo cannot see a wilt's cause


def test_tomato_words_can_label_a_saved_photo():
    assert LABELS["early_blight"] == "Early blight" and LABELS["rust"] == "Guava rust" and LABELS["chlorosis"]


def test_the_guide_screen_serves_either_crop():
    assert {d["id"] for d in client.get("/api/v1/photos/guide?crop=tomato").json()} == set(TOMATO.by_id)
    assert {d["id"] for d in client.get("/api/v1/photos/guide").json()} == set(GUAVA.by_id)


def test_a_tomato_photo_is_checked_with_the_tomato_guide_and_gets_no_guava_soil_rule():
    stub = Stub(Seen("early_blight", None, "Brown ringed spots on old leaves.", "septoria"))
    app.dependency_overrides[get_classifier] = lambda: stub
    body = client.post("/api/v1/photos/check?crop=tomato", files={"photo": ("a.jpg", JPEG, "image/jpeg")}).json()
    app.dependency_overrides.clear()
    assert stub.guide is TOMATO and body["crop"] == "tomato"
    assert [m["id"] for m in body["matches"]] == ["early_blight", "septoria"] and body["symptom"] is None


# ---------------------------------------------------------------- the rover's flagged plants


def state(**over) -> dict:
    s = {"missionId": "m-1", "status": "running", "zoneId": "t1", "simulated": False,
         "observation": {"row": 1, "col": 2, "plant": True, "flagged": True}, "photo": base64.b64encode(JPEG).decode()}
    return {**s, **over}


def test_only_a_real_rovers_flagged_stops_are_checked():
    assert rover_photos.wanted(state(), simulated_too=False)
    assert not rover_photos.wanted(state(simulated=True), simulated_too=False)        # drawn squares, not plants
    assert rover_photos.wanted(state(simulated=True), simulated_too=True)
    assert not rover_photos.wanted(state(observation={"row": 1, "col": 2, "flagged": False}), simulated_too=False)
    assert not rover_photos.wanted({k: v for k, v in state().items() if k != "photo"}, simulated_too=False)
    assert not rover_photos.wanted(state(status="completed"), simulated_too=False)


def test_what_the_map_says_about_a_check():
    assert rover_photos.title_of(TOMATO, "early_blight") == "Possible early blight"
    assert rover_photos.title_of(TOMATO, "healthy") == "Looks healthy"
    assert rover_photos.title_of(TOMATO, "problem") == "A problem: go and look"
    assert rover_photos.title_of(TOMATO, None) == "Not sure: go and look"
    assert guide_for("Cherry tomato") is TOMATO and guide_for(None) is GUAVA


@pgdb.with_db("aaf_rover_photos")
async def test_a_flagged_plant_is_kept_checked_as_tomato_and_shown_on_the_map(Session):
    from app.services.seed import seed_stage1, seed_tomato_demo
    async with Session() as s:
        await seed_stage1(s, beds=())
    async with Session() as s:
        await seed_tomato_demo(s)
    saved_dir, settings.photo_dir = settings.photo_dir, tempfile.mkdtemp()
    try:
        live = RoverLive()
        live.queued("m-1", "t1", 5, 20, 0.5, 1.0, None)
        stub = Stub(Seen("early_blight", None, "Brown ringed spots on old leaves.", "septoria"))
        check = await rover_photos.keep_and_check(state(), classifier=stub, session_factory=Session, live=live)
        assert stub.guide is TOMATO
        assert (check["status"], check["title"], check["also"]) == ("ok", "Possible early blight", "Septoria leaf spot")
        assert live.snapshot()["mission"]["cells"][0]["check"]["photoId"] == check["photoId"]
        # the online model is down: the photo is still kept, and the map says why there is no answer
        down = await rover_photos.keep_and_check(state(observation={"row": 0, "col": 0, "flagged": True}),
                                                 classifier=Stub(fail=True), session_factory=Session, live=live)
        assert down["status"] == "unavailable" and "usage limit" in down["problem"] and down["photoId"]
        async with Session() as s:
            photos = (await s.scalars(select(PlantPhoto).order_by(PlantPhoto.tree_col))).all()
        assert [(p.tree_row, p.tree_col, p.model_label) for p in photos] == [(0, 0, None), (1, 2, "early_blight")]
        assert all(p.note.startswith("Rover photo") and p.part == "leaf" for p in photos)
        # a photo that is not an image is dropped, not saved
        assert await rover_photos.keep_and_check(state(photo=base64.b64encode(b"not a photo").decode()),
                                                 classifier=stub, session_factory=Session, live=live) is None
    finally:
        settings.photo_dir = saved_dir
