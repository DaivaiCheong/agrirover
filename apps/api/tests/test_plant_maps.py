"""Plant maps: a block's grid of spots and where its plants stand, so the rover goes from plant to plant."""
import pgdb
import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app.models.entities import PlantMap, Zone
from app.routers.plant_maps import MapIn
from app.services.seed import TOMATO_DEMO, seed_stage1, seed_tomato_demo


def test_plants_must_stand_on_the_grid_once_each():
    m = MapIn(rows=2, cols=3, rowM=0.8, plantM=0.5, plants=[(1, 1), (0, 0), (0, 0)])
    assert m.plants == [(0, 0), (1, 1)] and m.crop == "Tomato"
    for bad in ({"plants": [(2, 0)]}, {"plants": [(0, 3)]}, {"plants": [(-1, 0)]}, {"rowM": 0.1}, {"rows": 41}):
        with pytest.raises(ValidationError):
            MapIn(**{"rows": 2, "cols": 3, "rowM": 0.8, "plantM": 0.5, **bad})


def test_the_tomato_farm_is_50_m2_at_field_spacing_with_three_gaps():
    t = TOMATO_DEMO
    assert (t.rows, t.cols, t.row_m, t.plant_m) == (5, 20, 1.0, 0.5) and t.rows * t.row_m * t.cols * t.plant_m == 50
    assert len(t.plants) == 97 and len(set(t.plants)) == 97
    assert all(0 <= r < t.rows and 0 <= c < t.cols for r, c in t.plants)


@pgdb.with_db("aaf_plant_map_seed")
async def test_the_tomato_demo_is_seeded_once_beside_the_guava_beds(Session):
    async with Session() as s:
        await seed_stage1(s)
    async with Session() as s:
        assert await seed_tomato_demo(s) is True
    async with Session() as s:
        assert await seed_tomato_demo(s) is False                       # safe to repeat
        zones = (await s.scalars(select(Zone.name).order_by(Zone.name))).all()
        assert zones == ["g1", "g2", "g3", "g4", "g5", "g6", "t1"]
    async with pgdb.api(Session) as c:
        maps = (await c.get("/api/v1/plant-maps")).json()
        assert [(m["zone"], m["crop"], len(m["plants"]), m["rows"], m["cols"]) for m in maps] == [("t1", "Tomato", 97, 5, 20)]
        assert any(z["zone"] == "t1" for z in (await c.get("/api/v1/zones")).json())     # it shows as a block


@pgdb.with_db("aaf_plant_map_real_farm")
async def test_without_the_demo_orchard_the_farm_is_the_tomato_block_alone(Session):
    from app.models.entities import Device, Planting
    async with Session() as s:
        await seed_stage1(s, beds=())
    async with Session() as s:
        assert await seed_tomato_demo(s) is True
    async with Session() as s:
        assert (await s.scalars(select(Zone.name))).all() == ["t1"]
        assert (await s.scalars(select(Planting))).all() == []                          # no guava cycles, no mock rounds
        assert {d.code for d in (await s.scalars(select(Device))).all()} >= {"ROVER-01"}   # the rover can still report
    async with pgdb.api(Session) as c:
        assert (await c.get("/api/v1/advice")).status_code == 200
        assert (await c.get("/api/v1/missions/live")).status_code == 200


@pgdb.with_db("aaf_plant_map_api")
async def test_make_a_block_place_plants_and_change_the_grid(Session):
    async with Session() as s:
        await seed_stage1(s)
    async with pgdb.api(Session) as c:
        made = await c.post("/api/v1/plant-maps", json={"label": "Tomato table", "rows": 1, "cols": 4, "rowM": 0.6, "plantM": 0.4})
        assert made.status_code == 201 and made.json()["zone"] == "tomato-table" and made.json()["plants"] == []
        again = await c.post("/api/v1/plant-maps", json={"label": "Tomato table", "rows": 1, "cols": 4, "rowM": 0.6, "plantM": 0.4})
        assert again.status_code == 409
        put = await c.put("/api/v1/plant-maps/tomato-table", json={"crop": "Cherry tomato", "rows": 2, "cols": 4, "rowM": 0.6,
                                                                    "plantM": 0.4, "plants": [[1, 3], [0, 1]]})
        assert put.status_code == 200 and put.json()["plants"] == [[0, 1], [1, 3]] and put.json()["crop"] == "Cherry tomato"
        assert (await c.put("/api/v1/plant-maps/tomato-table", json={"rows": 2, "cols": 4, "rowM": 0.6, "plantM": 0.4,
                                                                      "plants": [[2, 0]]})).status_code == 422
        assert (await c.put("/api/v1/plant-maps/nope", json={"rows": 1, "cols": 1, "rowM": 1, "plantM": 1})).status_code == 404
        # a guava bed can be given a map too
        assert (await c.put("/api/v1/plant-maps/g6", json={"rows": 1, "cols": 2, "rowM": 1, "plantM": 1, "plants": [[0, 1]]})).status_code == 200
    async with Session() as s:
        assert len((await s.scalars(select(PlantMap))).all()) == 2
