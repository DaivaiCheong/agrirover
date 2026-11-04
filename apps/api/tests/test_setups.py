"""Growing setups and the yield forecast: the code must reproduce the owner's 50 m2 benchmark table."""
import pgdb
import pytest

from app.services import crop_guide
from app.services import setups as su
from app.services.errors import Invalid
from app.services.seed import seed_stage1

V1 = "/api/v1"
TABLE = {   # id: (plants per 50 m2, kg per plant, expected harvest in kg): the owner's table
    "open_field": ((100, 125), (2.5, 4.0), (250, 500)),
    "raised_bed": ((125, 150), (4.0, 5.0), (500, 750)),
    "net_house": ((150, 175), (6.0, 8.0), (900, 1400)),
}


def tomato(setup_id):
    return su.get("tomato", setup_id)


# ------------------------------------------------------------------- the table

def test_there_are_three_setups_in_the_owners_order():
    assert [s.id for s in su.for_crop("tomato")] == ["open_field", "raised_bed", "net_house"]


@pytest.mark.parametrize("setup_id", TABLE)
def test_the_50_m2_benchmark_is_the_owners_table(setup_id):
    plants, kg_plant, harvest = TABLE[setup_id]
    d = tomato(setup_id).to_dict()
    assert d["referenceBedM2"] == 50
    assert d["plantsPerReferenceBed"] == list(plants)
    assert d["kgPerPlant"] == list(kg_plant)
    assert d["kgPerReferenceBed"] == list(harvest)


@pytest.mark.parametrize("setup_id", TABLE)
def test_forecast_at_the_two_ends_of_the_plant_range_gives_the_two_ends_of_the_harvest(setup_id):
    plants, kg_plant, harvest = TABLE[setup_id]
    s = tomato(setup_id)
    assert s.forecast(plants[0])["kgLow"] == harvest[0]          # fewest plants at the lowest yield
    assert s.forecast(plants[1])["kgHigh"] == harvest[1]         # most plants at the highest yield


def test_density_ranges_are_the_owners():
    assert [s.density for s in su.for_crop("tomato")] == [(2.0, 2.5), (2.5, 3.0), (3.0, 3.5)]


@pytest.mark.parametrize("s", su.for_crop("tomato"), ids=lambda s: s.id)
def test_the_suggested_spacing_lands_inside_the_density_range(s):
    assert s.density[0] <= s.spacing_density <= s.density[1]
    assert s.to_dict()["spacingBasis"] == "practice" and s.to_dict()["basis"] == "spec"


def test_a_bed_takes_the_middle_of_the_density_range():
    assert [tomato(i).plants_for_area(50) for i in TABLE] == [113, 138, 163]     # 112.5, 137.5, 162.5 round up
    assert tomato("open_field").plants_for_area(0.1) == 1                       # never zero plants


def test_the_net_house_yield_sits_inside_what_the_aomori_greenhouse_growers_got():
    per_plant = [t * 1000 / crop_guide.AOMORI_PLANTS_PER_10A for _, t in crop_guide.AOMORI_YIELDS]
    lo, hi = tomato("net_house").kg_per_plant
    assert min(per_plant) <= lo and hi <= max(per_plant)                         # 5.4 .. 8.8 kg per plant


# ------------------------------------------------------------------- revenue

def test_revenue_needs_a_price_and_is_the_harvest_times_it():
    assert tomato("open_field").forecast(100)["revenueLowUsd"] is None
    f = tomato("open_field").forecast(100, 1.5)
    assert (f["kgLow"], f["kgHigh"], f["kgMid"]) == (250, 400, 325) and (f["revenueLowUsd"], f["revenueHighUsd"]) == (375, 600)
    assert f["pricePerKgUsd"] == 1.5 and f["basis"] == "spec"


def test_forecast_is_for_the_plants_you_have_not_always_50_m2():
    f = tomato("raised_bed").forecast(112)
    assert (f["kgLow"], f["kgHigh"]) == (448, 560)


# ----------------------------------------------------------------- validation

def test_check_accepts_nothing_or_a_known_setup_and_refuses_the_rest():
    su.check("tomato", None)
    su.check("tomato", "net_house")
    with pytest.raises(Invalid, match="unknown growing setup"):
        su.check("tomato", "hydroponic")
    with pytest.raises(Invalid, match="only defined for tomato"):
        su.check("chilli", "open_field")
    assert su.for_crop("chilli") == () and su.for_crop(None) == () and su.get("tomato", None) is None


# ------------------------------------------------------------------------- API

@pgdb.with_db("aaf_setups_api")
async def test_setups_route_lists_the_table_and_is_empty_for_other_crops(Session):
    async with pgdb.api(Session) as c:
        got = (await c.get(f"{V1}/setups?crop=tomato")).json()
        assert [s["id"] for s in got] == list(TABLE)
        assert got[2]["kgPerReferenceBed"] == [900, 1400] and got[2]["rowCm"] == 80 and got[2]["plantCm"] == 40
        assert (await c.get(f"{V1}/setups?crop=chilli")).json() == []
        assert len((await c.get(f"{V1}/setups")).json()) == 3                   # tomato is the default
        assert [s["plantsForArea"] for s in got] == [None, None, None]          # no area given: no plant count
        sized = (await c.get(f"{V1}/setups?crop=tomato&area=50")).json()
        assert [s["plantsForArea"] for s in sized] == [113, 138, 163]           # the middle of each density range
        assert (await c.get(f"{V1}/setups?area=0")).status_code == 422


@pgdb.with_db("aaf_setups_cycle")
async def test_a_cycle_carries_its_setup_and_the_forecast_follows_the_plant_count(Session):
    async with Session() as s:
        await seed_stage1(s)
    async with pgdb.api(Session) as c:
        bed = (await c.post(f"{V1}/zones", json={"label": "Net house 1", "areaM2": 50})).json()
        made = await c.post(f"{V1}/cycles", json={"zone": bed["name"], "crop": "tomato", "plantedOn": "2026-11-10",
                                                   "plantCount": 160, "areaM2": 50, "setup": "net_house",
                                                   "expectedPriceUsdPerKg": 1.2})
        assert made.status_code == 201, made.text
        cyc = made.json()
        assert (cyc["setup"], cyc["setupLabel"], cyc["expectedPriceUsdPerKg"]) == ("net_house", "Net-house or greenhouse", 1.2)
        f = cyc["forecast"]
        assert (f["kgLow"], f["kgHigh"], f["revenueLowUsd"], f["revenueHighUsd"]) == (960, 1280, 1152, 1536)

        again = (await c.patch(f"{V1}/cycles/{cyc['id']}", json={"plantCount": 150})).json()
        assert (again["forecast"]["kgLow"], again["forecast"]["kgHigh"]) == (900, 1200)
        switched = (await c.patch(f"{V1}/cycles/{cyc['id']}", json={"setup": "raised_bed"})).json()
        assert switched["setup"] == "raised_bed" and switched["forecast"]["kgLow"] == 600
        listed = {x["id"]: x for x in (await c.get(f"{V1}/cycles")).json()}
        assert listed[cyc["id"]]["forecast"]["kgHigh"] == 750                    # the list carries it too

        other = (await c.post(f"{V1}/zones", json={"label": "Plain bed"})).json()["name"]
        made = await c.post(f"{V1}/cycles", json={"zone": other, "crop": "tomato", "plantedOn": "2026-11-10",
                                                   "plantCount": 100})
        assert made.status_code == 201, made.text
        plain = made.json()
        assert plain["setup"] is None and plain["forecast"] is None and plain["setupLabel"] is None


@pgdb.with_db("aaf_setups_bad")
async def test_a_bad_setup_or_price_is_refused_and_nothing_is_created(Session):
    async with Session() as s:
        await seed_stage1(s)
    async with pgdb.api(Session) as c:
        base = {"zone": "zone-a", "crop": "tomato", "plantedOn": "2026-11-10", "plantCount": 100}
        r = await c.post(f"{V1}/cycles", json={**base, "setup": "hydroponic"})
        assert r.status_code == 422 and "unknown growing setup" in r.json()["detail"]
        assert (await c.post(f"{V1}/cycles", json={**base, "expectedPriceUsdPerKg": -1})).status_code == 422
        assert (await c.post(f"{V1}/crops", json={"name": "Chilli", "kc": {"ini": .6, "mid": 1, "end": .8},
                                                    "stageDays": [20, 30, 40, 20]})).status_code == 201
        r = await c.post(f"{V1}/cycles", json={**base, "crop": "chilli", "setup": "open_field"})
        assert r.status_code == 422 and "only defined for tomato" in r.json()["detail"]
        # zone-a's seeded cycle is still the only open one: the refused requests created nothing
        open_cycles = [x for x in (await c.get(f"{V1}/cycles")).json() if x["zone"] == "zone-a" and x["status"] == "active"]
        assert len(open_cycles) == 1
        cid = open_cycles[0]["id"]
        r = await c.patch(f"{V1}/cycles/{cid}", json={"setup": "hydroponic"})
        assert r.status_code == 422


@pgdb.with_db("aaf_setups_cop")
async def test_the_cost_report_shows_what_a_kilo_costs_if_the_benchmark_is_reached(Session):
    async with Session() as s:
        await seed_stage1(s)
    async with pgdb.api(Session) as c:
        cid = (await c.post(f"{V1}/zones", json={"label": "Bed C", "areaM2": 50})).json()["name"]
        cyc = (await c.post(f"{V1}/cycles", json={"zone": cid, "crop": "tomato", "plantedOn": "2026-11-01", "plantCount": 160,
                                                   "areaM2": 50, "setup": "net_house"})).json()
        none_yet = (await c.get(f"{V1}/cycles/{cyc['id']}/cop?today=2026-11-10")).json()
        assert none_yet["costPerKgIfBenchmark"] is None                          # no cost recorded: nothing to divide
        assert (await c.post(f"{V1}/costs", json={"plantingId": cyc["id"], "date": "2026-11-05", "category": "seed",
                                                  "amount": 480})).status_code == 201
        cop = (await c.get(f"{V1}/cycles/{cyc['id']}/cop?today=2026-11-10")).json()
        total = cop["totalCostUsd"]
        assert total >= 480
        assert cop["cycle"]["forecast"]["kgLow"] == 960
        assert cop["costPerKgIfBenchmark"] == {"atLowYield": round(total / 960, 3), "atHighYield": round(total / 1280, 3)}
        assert cop["costPerKgIfBenchmark"]["atLowYield"] > cop["costPerKgIfBenchmark"]["atHighYield"]
