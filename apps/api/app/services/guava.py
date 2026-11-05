"""Guava: the stages, setups, rules and tasks. Pure data and pure functions: no database and no clock.

Numbers come from the guava document pasted on 2026-11-05, which lists no sources, so they are "guava document,
not checked" unless docs/GUAVA-RESEARCH.md says otherwise. Where the document does not add up, DOC_ISSUES says so.
This module advises. It never opens a valve.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta

SLUG = "guava"
SOURCE = "Guava document (pasted 2026-11-05). It lists no sources; these numbers were not checked against a study."
BASIS = "guava_doc"
CYCLE_DAYS = 180
HARVEST_DAYS = (146, 180)
RAINY_MONTHS = (5, 6, 7, 8, 9, 10)
FLOWERING_FLOOR = 55.0
GENERAL_MOISTURE = (55.0, 75.0)      # stage 1 when the cycle was not started by withholding water
FIRMWARE_LIMIT_S = 90                # edge/esp8266-field-node: MAX_RUN_MS
FRESH_FOR = timedelta(hours=36)      # the rover comes once a day: yesterday's round still counts, the day before's does not


@dataclass(frozen=True)
class Reading:
    value: float
    at: datetime


@dataclass(frozen=True)
class Stage:
    n: int
    key: str
    short: str
    title: str
    first_day: int
    last_day: int
    moisture: tuple[float, float]
    ec: tuple[float, float]
    kc: float | None
    etc_pct: tuple[float, float] | None
    water: str
    feed: str
    actions: str

    def to_dict(self) -> dict:
        return {"n": self.n, "key": self.key, "short": self.short, "title": self.title, "firstDay": self.first_day,
                "lastDay": self.last_day, "moisture": list(self.moisture), "ec": list(self.ec), "kc": self.kc,
                "etcPct": list(self.etc_pct) if self.etc_pct else None, "water": self.water, "feed": self.feed,
                "actions": self.actions}


STAGES = (
    Stage(1, "induction", "Stress", "Induction stress and pruning", 1, 45, (20, 30), (0.8, 1.2), None, None,
          "Withhold water. Then two priming irrigations 3 days apart.",
          "No nitrogen during stress. Basal manure and biologicals 15 days before re-watering.",
          "Raise the C:N ratio. Prune 50-75 % of shoot length, or bend branches."),
    Stage(2, "flush", "Flush", "Bud break and vegetative flush", 46, 75, (60, 70), (1.2, 1.8), 0.75, (80, 100),
          "Drip pulses 2-3 times a week.", "High nitrogen, balanced P and K, soil micronutrients.",
          "Pinch shoots at 30-35 cm once they have 4-5 leaf pairs."),
    Stage(3, "bloom", "Bloom", "Flowering and fruit set", 76, 105, (65, 75), (1.5, 2.2), 0.93, (100, 100),
          "Full demand. Moisture must stay above 55 %.", "Low nitrogen; high P, K, calcium and boron.",
          "No water deficit at bloom. Foliar zinc and boron, potassium at fruit set."),
    Stage(4, "bulking", "Bulking", "Fruit bulking and bagging", 106, 145, (60, 75), (1.8, 2.5), 1.03, (100, 100),
          "Full demand, with mulch.", "High K, calcium and magnesium.", "Bag every fruit at 3-4 cm: foam net plus plastic bag."),
    Stage(5, "maturation", "Harvest", "Maturation and harvest", 146, 180, (50, 60), (2.0, 2.7), 1.1, (60, 80),
          "Taper the water: a controlled deficit raises sugar and avoids splitting.", "No nitrogen. High K and boron.",
          "Stop nitrogen 30-40 days before harvest. Pick crisp-mature."),
)


def stage_of(day: int) -> Stage:
    if day < 1:
        return STAGES[0]
    return next((s for s in STAGES if s.first_day <= day <= s.last_day), STAGES[-1])


METHODS = (
    {"id": "withhold", "label": "Withhold water (60-90 days)", "note": "For well-drained sandy loam. Soil is held at 20-30 % until leaves drop."},
    {"id": "bending", "label": "Branch bending", "note": "Trees 2-8 years old at wide spacing. No water stress needed."},
    {"id": "pruning", "label": "Shoot pruning", "note": "High-density planting. Removes 50-75 % of this season's shoot length."},
    {"id": "chemical", "label": "Chemical deblossoming", "note": "Confirm the product and dose with an agronomist first."},
)


def method_label(method_id: str | None) -> str:
    return next((m["label"] for m in METHODS if m["id"] == method_id), method_id or "Not set")


# ------------------------------------------------------------------ orchard setups

@dataclass(frozen=True)
class Setup:
    id: str
    letter: str
    label: str
    method: str
    cultivars: str
    row_m: float
    tree_m: float
    trees_per_ha: tuple[float, float]
    first_bearing: str
    kg_per_tree: tuple[float, float]
    t_per_ha: tuple[float, float]
    trees50: tuple[int, int]
    kg50: tuple[float, float]
    npk: str
    npk_g: tuple[float, float, float]    # N, P, K g per tree a year used for a dose: the middle of the document's range
    drip: str
    lph: float
    price: tuple[float, float]
    doc_issue: str | None = None

    def trees_for_area(self, area_m2: float) -> int:
        return max(1, round(area_m2 / (self.row_m * self.tree_m)))

    def to_dict(self, area: float | None = None) -> dict:
        return {
            "id": self.id, "label": self.label, "method": self.method,
            "plantsForArea": self.trees_for_area(area) if area else None,
            "density": [self.trees_per_ha[0] / 10000, self.trees_per_ha[1] / 10000], "kgPerPlant": list(self.kg_per_tree),
            "referenceBedM2": 50, "plantsPerReferenceBed": list(self.trees50), "kgPerReferenceBed": list(self.kg50),
            "rowCm": self.row_m * 100, "plantCm": self.tree_m * 100, "spacingPlantsPerM2": 1 / (self.row_m * self.tree_m),
            "basis": BASIS, "spacingBasis": BASIS,
            "orchard": {"letter": self.letter, "cultivars": self.cultivars, "treesPerHa": list(self.trees_per_ha),
                        "firstBearing": self.first_bearing, "tPerHa": list(self.t_per_ha), "kgPer50m2": list(self.kg50),
                        "npk": self.npk, "drip": self.drip, "emitterLphPerTree": self.lph, "priceUsd": list(self.price),
                        "docIssue": self.doc_issue},
        }

    def forecast(self, trees: int, price: float | None) -> dict:
        low, high = round(trees * self.kg_per_tree[0], 1), round(trees * self.kg_per_tree[1], 1)
        return {"setup": self.id, "label": self.label, "plants": trees, "kgLow": low, "kgHigh": high,
                "kgMid": round((low + high) / 2, 1), "pricePerKgUsd": price,
                "revenueLowUsd": None if price is None else round(low * price, 2),
                "revenueHighUsd": None if price is None else round(high * price, 2), "basis": BASIS}


SETUPS = (
    Setup("wide", "A", "A. Traditional wide orchard", "5 x 5 m. Branch bending works here. Long-lived trees.",
          "Sardar (L-49), Allahabad Safeda, local Khmer", 5, 5, (278, 400), "Year 3-4", (25, 46.9), (12, 20), (2, 2), (60, 90),
          "600-800 : 300-600 : 600 g per tree a year", (700, 450, 600), "2-4 emitters a tree, 4-8 L/h each", 16, (0.75, 0.75),
          "Trees x yield gives 7-19 t/ha and 50-94 kg per 50 m². The document says 12-20 t/ha and 60-90 kg."),
    Setup("commercial", "B", "B. Southeast Asian commercial", "3 x 3.5 m. The Kimju and Taiwan Pearl standard.",
          "Kimju, Taiwan Pearl, Kaohsiung Pearl", 3, 3.5, (714, 952), "Year 1-2", (30, 35), (22, 33), (5, 5), (150, 175),
          "300-400 g NPK plus 10-12 kg organic per tree", (108, 81, 162), "2 emitters a tree, 4 L/h each", 8, (1.1, 1.25)),
    Setup("hedgerow", "C", "C. Intensive lowland hedgerow", "3 x 2 m. High density on small holdings.",
          "Kimju, Crystal Guava, Pearl", 3, 2, (1667, 2000), "Year 1-2", (15, 22), (25, 38), (8, 10), (150, 200),
          "300 : 175 : 175 g per tree", (300, 175, 175), "2 inline emitters a tree, 4 L/h", 8, (1.1, 1.25),
          "3 x 2 m is 1,667 trees/ha; 2,000 needs closer spacing. Trees x yield gives 25-44 t/ha and 120-220 kg per 50 m². "
          "The document says 25-38 t/ha and 150-200 kg."),
    Setup("meadow", "D", "D. Meadow orchard (ultra-high density)", "2 x 1 m. Single-trunk hedge. Fits a 50 m² pilot bed.",
          "Lalit, Allahabad Safeda, dwarf Kimju", 2, 1, (5000, 5000), "Year 1", (6, 10), (29.5, 50), (25, 25), (150, 250),
          "400 : 200 : 200 g per tree (135 : 60 : 60 g in year 2)", (400, 200, 200), "Inline drip tape, 2-4 L/h at 0.5-1.0 m", 4, (1.0, 1.2)),
)
SETUP_BY_ID = {s.id: s for s in SETUPS}


# ------------------------------------------------------------------ what each reading should be

META = {
    "soil_moisture": ("Soil moisture", "Moisture", "pct", 1), "soil_ph": ("Soil pH", "pH", "pH", 2),
    "soil_ec": ("Soil EC", "EC", "mS/cm", 2), "soil_temperature": ("Soil temperature", "Soil °C", "C", 1),
    "nitrogen": ("Nitrogen", "N", "mg/kg", 0), "phosphorus": ("Phosphorus", "P", "mg/kg", 0),
    "potassium": ("Potassium", "K", "mg/kg", 0), "air_temperature": ("Air temperature", "Air °C", "C", 1),
    "air_humidity": ("Air humidity", "RH", "pct", 1),
}
METRICS = tuple(META)
RANK = {"critical": 3, "warning": 2, "normal": 1, "stale": 0, "no_data": 0, "unrated": 0}


@dataclass(frozen=True)
class Band:
    lo: float
    hi: float
    crit_lo: float | None = None
    crit_hi: float | None = None


def moisture_band(stage: Stage, stress: bool) -> tuple[float, float]:
    return GENERAL_MOISTURE if stage.n == 1 and not stress else stage.moisture


def bands(stage: Stage, stress: bool) -> dict[str, Band | None]:
    lo, hi = moisture_band(stage, stress)
    return {
        "soil_moisture": Band(lo, hi, 45.0 if stage.n == 3 else None, 85.0),
        "soil_ph": Band(5.5, 7.0, 4.5, 7.5),
        "soil_ec": Band(stage.ec[0], stage.ec[1], None, 3.0),
        "soil_temperature": Band(20, 28, None, 32),
        # shown but never rated: a low-cost probe infers these from conductivity (docs/GUAVA-RESEARCH.md)
        "nitrogen": None, "phosphorus": None, "potassium": None,
        "air_temperature": Band(23, 28, 15, 35),
        "air_humidity": Band(60, 80, None, None if stage.n == 1 and stress else 85),
    }


PARAM_RULES = (
    {"label": "Soil moisture", "target": "Follows the stage, 20-75 %", "critical": "Above 85 % (saturation). Below 45 % at bloom", "note": "Probe at 15-30 cm, inside the wet bulb"},
    {"label": "Soil pH", "target": "5.5-7.0", "critical": "Below 4.5, above 7.5", "note": "Dolomite 1 kg a tree below 5.0; acidifying feed above 7.2"},
    {"label": "Soil EC (dS/m = mS/cm)", "target": "Follows the stage, 0.8-2.7", "critical": "Above 3.0 (document: 2.78-3.0). Below 0.8 is a warning here", "note": "High: leaching flush. Low: more feed"},
    {"label": "Soil temperature", "target": "20-28 °C", "critical": "Above 32 °C", "note": "Suggest mulch"},
    {"label": "N, P, K", "target": "Trend only, never a dose", "critical": "None", "note": "A low-cost probe infers these from conductivity. Use a leaf test"},
    {"label": "Air temperature", "target": "23-28 °C. Spray window 18-25 °C", "critical": "Below 15 °C, above 35 °C (sun-scald)", "note": "Above 30 °C spray evaporates"},
    {"label": "Air humidity", "target": "60-80 %", "critical": "Above 85 % (fungal)", "note": "Below 50 % spray dries too fast"},
)


def _rate(value: float, b: Band) -> tuple[str, str | None]:
    if b.crit_hi is not None and value > b.crit_hi:
        return "critical", "high"
    if b.crit_lo is not None and value < b.crit_lo:
        return "critical", "low"
    if value < b.lo:
        return "warning", "low"
    if value > b.hi:
        return "warning", "high"
    return "normal", None


def alerts_for(r: Mapping[str, float], day: int, *, stress: bool, recent_min: float | None, fruit_mm: float | None,
               bagged: bool) -> list[dict]:
    """Every rule that fires on these readings. A reading that is missing fires nothing. `hits` names the readings blamed."""
    stage = stage_of(day)
    out: list[dict] = []

    def add(alert_id: str, severity: str, title: str, message: str, hits: list[tuple[str, str]]) -> None:
        out.append({"id": alert_id, "severity": severity, "title": title, "message": message,
                    "metrics": [h[0] for h in hits], "hits": hits})

    m, ph, ec = r.get("soil_moisture"), r.get("soil_ph"), r.get("soil_ec")
    soil, air, rh = r.get("soil_temperature"), r.get("air_temperature"), r.get("air_humidity")
    in_stress = stress and stage.n == 1

    if in_stress and rh is not None and rh > 85:
        add("stress_humidity", "warning", "Humid air may stop the stress working",
            f"Humidity {rh:.0f} %. Trees may not shed leaves. If they do not, consider pruning or deblossoming instead.", [("air_humidity", "high")])
    if m is not None:
        if in_stress and m > 30:
            add("stress_leak", "warning", "Soil is too wet for stress", f"Soil moisture {m:.1f} % is above the 30 % stress ceiling.", [("soil_moisture", "high")])
        if m > 85:
            add("saturation", "critical", "Saturated soil, wilt risk", f"Soil moisture {m:.1f} % is above 85 %. Stop watering: wet soil speeds Fusarium wilt.", [("soil_moisture", "high")])
        if stage.n == 3 and m < FLOWERING_FLOOR:
            add("bloom_floor", "critical", "Moisture below the bloom floor", f"Soil moisture {m:.1f} % is below {FLOWERING_FLOOR:.0f} %. A deficit at bloom makes flowers drop.", [("soil_moisture", "low")])
        if stage.n >= 4 and m > 80 and recent_min is not None and recent_min < 35:
            add("cracking", "critical", "Fruit cracking risk",
                f"Moisture jumped from {recent_min:.0f} % to {m:.0f} %. Sudden water after a dry spell splits fruit. Water little and often; boron and calcium sprays help.", [("soil_moisture", "high")])
    if ph is not None:
        if ph < 4.5:
            add("acid", "critical", "Very acid soil", f"Soil pH {ph:.2f} is below 4.5: aluminium and manganese toxicity. Dolomite 1 kg a tree.", [("soil_ph", "low")])
        if ph > 7.5:
            add("alkaline", "critical", "Alkaline soil", f"Soil pH {ph:.2f} is above 7.5: iron, zinc and boron lock up.", [("soil_ph", "high")])
        elif ph > 7.2:
            add("alkaline_feed", "warning", "Soil turning alkaline", f"Soil pH {ph:.2f} is above 7.2. Use an acidifying feed (MAP) and keep feed water below pH 6.5.", [("soil_ph", "high")])
    if ec is not None:
        if ec > 3.0:
            add("salinity", "critical", "Salt stress", f"Soil EC {ec:.2f} is above 3.0. Run a leaching flush.", [("soil_ec", "high")])
        if ec < 0.8 and stage.n > 1:
            add("low_ec", "warning", "Nutrients running low", f"Soil EC {ec:.2f} is below 0.8. Do not skip the next feed; take a leaf test.", [("soil_ec", "low")])
    if soil is not None and soil > 32:
        add("root_heat", "critical", "Hot root zone", f"Soil {soil:.1f} °C is above 32 °C. Mulch the bed.", [("soil_temperature", "high")])
    if air is not None and air > 35:
        add("sun_scald", "critical", "Fruit sun-scald", f"Air {air:.1f} °C is above 35 °C.", [("air_temperature", "high")])
    if not in_stress and rh is not None and rh > 85:
        add("fungal", "critical", "Fungal risk (anthracnose)", f"Humidity {rh:.0f} % is above 85 %. Thin the canopy, avoid wetting the leaves.", [("air_humidity", "high")])
    if stage.n == 4 and not bagged and fruit_mm is not None and fruit_mm >= 30:
        add("bag_now", "critical", "Bag the fruit now", f"Fruit is {fruit_mm:g} mm. Bag at 30-40 mm: foam net plus plastic bag, before fruit flies lay.", [])
    if stage.n >= 4 and not bagged and air is not None and rh is not None and 25 <= air <= 32 and rh > 70:
        add("fruit_fly", "warning", "Fruit fly weather", f"Air {air:.1f} °C and humidity {rh:.0f} %, and the fruit is not bagged yet.", [])
    return out


def rate_bed(readings: Mapping[str, Reading], day: int | None, *, now: datetime, stress: bool = False,
             recent_min: float | None = None, fruit_mm: float | None = None, bagged: bool = False) -> dict:
    """Readings and a crop day in; a status per reading, the alerts, and the bed's worst status out."""
    fresh = {k: r for k, r in readings.items() if now - r.at <= FRESH_FOR}
    stage = stage_of(day) if day is not None and day >= 1 else None
    limits = bands(stage, stress) if stage else {}
    raw = alerts_for({k: r.value for k, r in fresh.items()}, day, stress=stress, recent_min=recent_min, fruit_mm=fruit_mm, bagged=bagged) if stage else []

    params = []
    for metric, (label, short, unit, decimals) in META.items():
        r = readings.get(metric)
        band = limits.get(metric)
        direction = None
        if r is None:
            status = "no_data"
        elif metric not in fresh:
            status = "stale"
        elif band is None:
            status = "unrated"
        else:
            status, direction = _rate(r.value, band)
        for a in raw:
            for hit, way in a["hits"]:
                if hit == metric and RANK[a["severity"]] > RANK[status]:
                    status, direction = a["severity"], way
        params.append({"metric": metric, "label": label, "short": short, "unit": unit, "decimals": decimals,
                       "value": None if r is None else round(r.value, 3), "recordedAt": None if r is None else r.at.isoformat(),
                       "status": status, "direction": direction, "target": [band.lo, band.hi] if band else None})
    alerts = [{k: v for k, v in a.items() if k != "hits"} for a in raw]
    worst = "no_data"
    for s in [p["status"] for p in params] + [a["severity"] for a in alerts]:
        if RANK[s] > RANK[worst] or (RANK[s] == RANK[worst] == 0 and s == "stale"):
            worst = s
    return {
        "status": worst, "rated": True, "basis": BASIS, "source": SOURCE, "params": params, "alerts": alerts,
        "stage": None if stage is None else {
            "n": stage.n, "key": stage.key, "title": stage.title, "firstDay": stage.first_day, "lastDay": stage.last_day, "day": day,
            "extended": day > CYCLE_DAYS, "moisture": list(moisture_band(stage, stress)), "ec": list(stage.ec), "focus": stage.actions},
    }


# ------------------------------------------------------------------ tasks

@dataclass(frozen=True)
class Job:
    id: str
    first_day: int
    last_day: int
    title: str
    detail: str
    confirm: bool = False
    measure: bool = False
    ongoing: bool = False
    only: str | None = None


JOBS = (
    Job("prune", 1, 7, "Prune or bend", "Remove 50-75 % of this season's shoot length, or bend 8-10 upright branches to horizontal."),
    Job("hold", 1, 45, "Hold the water", "Keep soil at 20-30 %. Check that leaves are turning yellow and dropping.", ongoing=True, only="withhold"),
    Job("basal", 31, 35, "Basal feed, 15 days before re-watering", "Per tree: manure 10-50 kg, mycorrhiza 200 g, PSB 100-200 g, Azotobacter 20-25 g."),
    Job("priming", 46, 49, "Two priming irrigations", "Water on day 46 and again on day 49, then start the drip pulses."),
    Job("micronutrients", 46, 60, "Soil micronutrients", "Per tree: zinc sulphate 25-40 g, borax 15-20 g, iron sulphate 25 g."),
    Job("pinch", 60, 72, "Pinch new shoots", "When shoots have 4-5 leaf pairs, pinch at 30-35 cm."),
    Job("leaf_test", 70, 75, "Send a leaf sample to a lab", "The probe's N, P and K cannot set a dose. A leaf test can: compare with the ranges on the Fertilisation tab."),
    Job("zn_b", 76, 85, "Foliar zinc and boron", "Zinc sulphate 0.5 % plus boric acid 0.2 %. Spray at 18-25 °C.", confirm=True),
    Job("k_set", 95, 105, "Foliar potassium at fruit set", "Potassium sulphate 1.0 %, to hold more fruit on the tree.", confirm=True),
    Job("bag", 106, 125, "Bag the fruit at 3-4 cm", "Measure a few fruit. At 30-40 mm: inner foam net, outer plastic bag.", measure=True),
    Job("mg_fe", 110, 135, "Foliar magnesium and iron", "Magnesium sulphate 1.0 % plus iron sulphate 0.5 %. The document adds GA3 100 ppm.", confirm=True),
    Job("stop_n", 140, 150, "Stop nitrogen", "No nitrogen in the last 30-40 days before harvest."),
    Job("boron", 150, 165, "Foliar boron", "Boron 0.2 %, to prevent skin cracking.", confirm=True),
    Job("pick", 165, 180, "Pick crisp-mature", "Record each picking in Harvest and sales.", ongoing=True),
)
JOB_IDS = {j.id for j in JOBS}


def jobs_for(day: int, done: set[str], regulation: str | None) -> list[dict]:
    out = []
    for j in JOBS:
        if j.only and j.only != regulation:
            continue
        if j.id in done:
            state = "done"
        elif day < j.first_day:
            state = "later"
        elif day > j.last_day:
            state = "past" if j.ongoing else "overdue"
        else:
            state = "due"
        out.append({"id": j.id, "title": j.title, "detail": j.detail, "firstDay": j.first_day, "lastDay": j.last_day,
                    "stageN": stage_of(j.first_day).n, "state": state, "confirm": j.confirm, "measure": j.measure, "ongoing": j.ongoing})
    return out


# ------------------------------------------------------------------ fertigation recipe

_PHASES = [{"label": "Clean water", "pct": 25, "what": "Wet the root zone first"},
           {"label": "Feed", "pct": 50, "what": "Inject the fertilizer"},
           {"label": "Clean water", "pct": 25, "what": "Flush the lines"}]
_WATER_PH = "Keep feed water below pH 6.5 when injecting phosphate or micronutrients."
_CLASH = "Calcium nitrate must not share a tank with sulphates or phosphates: it precipitates and blocks emitters."

_RECIPE = {
    1: {"aim": "No feed during stress", "nitrogen": "None", "tanks": [], "clash": None, "foliar": [],
        "soil": "Basal manure and biologicals before re-watering. Dolomite 1 kg a tree if pH is below 5.0."},
    2: {"aim": "Build the canopy", "nitrogen": "High", "tanks": [{"name": "Tank A", "products": ["Calcium nitrate"]}, {"name": "Tank B", "products": ["Urea", "19:19:19"]}],
        "clash": _CLASH, "foliar": [], "soil": "Zinc sulphate 25-40 g, borax 15-20 g, iron sulphate 25 g per tree."},
    3: {"aim": "Flowers and fruit set", "nitrogen": "Low", "tanks": [{"name": "Tank A", "products": ["MAP 12:61:0", "Potassium nitrate 13:0:45"]}], "clash": None,
        "foliar": [{"text": "Zinc sulphate 0.5 % plus boric acid 0.2 %", "confirm": True}, {"text": "Potassium sulphate 1.0 % at fruit set", "confirm": True}], "soil": None},
    4: {"aim": "Fill the fruit", "nitrogen": "Medium", "tanks": [{"name": "Tank A", "products": ["Calcium nitrate"]}, {"name": "Tank B", "products": ["SOP 0:0:50", "Magnesium sulphate"]}],
        "clash": _CLASH, "foliar": [{"text": "Magnesium sulphate 1.0 % plus iron sulphate 0.5 %", "confirm": True}, {"text": "GA3 100 ppm", "confirm": True}], "soil": None},
    5: {"aim": "Sugar and skin", "nitrogen": "None", "tanks": [{"name": "Tank A", "products": ["SOP 0:0:50"]}], "clash": None, "foliar": [{"text": "Boron 0.2 %", "confirm": True}], "soil": None},
}


def fertigation_for(stage_n: int) -> dict:
    return {"stageN": stage_n, **_RECIPE[stage_n], "phases": [] if stage_n == 1 else _PHASES, "waterPh": _WATER_PH}


# Souza et al. 2013, bearing 'Paluma' orchards, Brazil (docs/GUAVA-RESEARCH.md): a starting reference for a leaf test.
LEAF_RANGES = [
    {"nutrient": "Nitrogen (N)", "range": "18-21 g/kg"}, {"nutrient": "Phosphorus (P)", "range": "1.5-1.7 g/kg"},
    {"nutrient": "Potassium (K)", "range": "15-17 g/kg"}, {"nutrient": "Calcium (Ca)", "range": "8-11 g/kg"},
    {"nutrient": "Magnesium (Mg)", "range": "1.8-2.5 g/kg"}, {"nutrient": "Sulphur (S)", "range": "2.5-2.9 g/kg"},
    {"nutrient": "Boron (B)", "range": "26-38 mg/kg"}, {"nutrient": "Iron (Fe)", "range": "54-112 mg/kg"},
    {"nutrient": "Manganese (Mn)", "range": "53-101 mg/kg"}, {"nutrient": "Zinc (Zn)", "range": "13-126 mg/kg"},
    {"nutrient": "Copper (Cu)", "range": "5-57 mg/kg"},
]


# ------------------------------------------------------------------ symptoms set against readings

@dataclass(frozen=True)
class Symptom:
    id: str
    title: str
    looks_like: str
    checks: tuple[tuple[str, str, float], ...]   # (metric, op, limit); soil_moisture_min is the lowest of the last 3 days
    explanation: str
    caveat: str | None = None
    rule: str = "any"                            # any | all | cracking


SYMPTOMS = {s.id: s for s in (
    Symptom("guava_decline", "Guava decline and wilt", "Older leaves yellow, shoots stunted, fast wilting, one side of a branch dies, galls on the roots.",
            (("soil_moisture", ">", 80), ("soil_ph", "<", 5.5)),
            "Wet, acid soil favours Fusarium and root-knot nematode. Stop over-watering, add mycorrhiza (200 g a tree) and Trichoderma, and dolomite (1 kg a tree) to raise pH.",
            "Sensors cannot see nematodes. Dig up some feeder roots and look for galls."),
    Symptom("fruit_fly", "Fruit fly and mealybug", "Puncture marks on the skin, oozing sap, larvae and soft rot inside, white waxy clusters at the calyx.",
            (("air_temperature", ">", 25), ("air_humidity", ">", 70)), "Warm, humid weather suits them. Bag fruit at 3-4 cm: foam net plus plastic bag.", rule="all"),
    Symptom("anthracnose", "Anthracnose and fruit rot", "Dark sunken patches on ripening fruit, often with pink spore masses. Young shoots die back.",
            (("air_humidity", ">", 85),), "Humid air and dense canopy. Thin the canopy, avoid wetting the leaves. A protective copper or bio-fungicide spray before bagging: confirm the product with an agronomist."),
    Symptom("cracking", "Fruit cracking", "Splits running along or across the crisp skin of ripening fruit.",
            (("soil_moisture_min", "<", 35), ("soil_moisture", ">", 80), ("soil_ph", ">", 7.5)),
            "A sudden jump in water after a dry spell, or high pH locking up boron and calcium. Keep moisture steady at 50-60 % with short drip pulses. Boron and calcium sprays help: confirm doses with an agronomist.", rule="cracking"),
    Symptom("chlorosis", "Micronutrient chlorosis", "Iron: youngest leaves yellow. Magnesium: yellow between veins on older leaves. Zinc: small, narrow rosette leaves.",
            (("soil_ph", ">", 7.2),), "Alkaline soil locks up iron and zinc. Acidify the feed water below pH 6.5. Foliar magnesium, iron and zinc: confirm doses with an agronomist.",
            "Too much phosphorus causes the same signs, and the sensors cannot tell the two apart. Check what has been fed."),
)}


def correlate(symptom_id: str, readings: Mapping[str, Reading], recent_min: float | None, now: datetime) -> dict:
    """One symptom against a bed's newest readings. An old reading is shown but never counted."""
    s = SYMPTOMS[symptom_id]
    evidence = []
    for metric, op, limit in s.checks:
        if metric == "soil_moisture_min":
            label, unit, decimals = "Lowest moisture, last 3 days", "pct", 1
            r = readings.get("soil_moisture")
            value, at = recent_min, r.at if r else None
        else:
            label, _short, unit, decimals = META[metric]
            r = readings.get(metric)
            value, at = (r.value, r.at) if r else (None, None)
        fresh = at is not None and value is not None and now - at <= FRESH_FOR
        met = (value < limit if op == "<" else value > limit) if fresh else None
        evidence.append({"metric": metric, "label": label, "unit": unit, "decimals": decimals, "op": op, "limit": limit,
                         "value": None if value is None else round(value, 2), "ageSeconds": None if at is None else max(0, round((now - at).total_seconds())),
                         "stale": at is not None and not fresh, "met": met})
    seen = [e for e in evidence if e["met"] is not None]
    if s.rule == "all":
        fits = bool(seen) and len(seen) == len(evidence) and all(e["met"] for e in evidence)
    elif s.rule == "cracking":
        fits = bool(evidence[0]["met"] and evidence[1]["met"]) or bool(evidence[2]["met"])
    else:
        fits = any(e["met"] for e in evidence)
    return {"symptom": s.id, "title": s.title, "looksLike": s.looks_like, "evidence": evidence,
            "verdict": "supported" if fits else ("not_supported" if seen else "no_data"),
            "explanation": s.explanation if fits else None, "basis": BASIS if fits else None, "caveat": s.caveat}


_LABELS = (("anthracnose", "anthracnose"), ("fruit_fly", "fruit_fly"), ("fruit fly", "fruit_fly"), ("mealybug", "fruit_fly"), ("wilt", "guava_decline"),
           ("decline", "guava_decline"), ("crack", "cracking"), ("chlorosis", "chlorosis"), ("yellow", "chlorosis"))


def match_symptom(label: str | None) -> str | None:
    """The symptom a photo model's label points to, if any."""
    text = (label or "").lower().replace("-", "_")
    return next((sym for word, sym in _LABELS if word in text), None)


# ------------------------------------------------------------------ what the document leaves open

DOC_ISSUES = [
    {"n": 1, "title": "Stress length", "detail": "Stage 1 is 45 days, but the stress protocol says withhold water for 60-90 days. The app uses 45."},
    {"n": 2, "title": "Bloom timing", "detail": "\"Days 65-79 post-flush\" lands around cycle day 111-125 (Stage 4), but flowering is Stage 3 (days 76-105). The app uses Stage 3."},
    {"n": 3, "title": "Yield tables", "detail": "Setups A and C do not multiply out (trees x yield). B and D do. The setup says where."},
    {"n": 4, "title": "Year or cycle", "detail": "Yields and yearly doses are per year and a cycle is 180 days. The app assumes one bearing cycle a year."},
    {"n": 5, "title": "Price", "detail": "5,500 riel is $1.38 at 4,000 riel to the dollar, not the $1.25 in the table. The app uses the table's dollars."},
    {"n": 6, "title": "Moisture scale", "detail": "55-75 % is above what most mineral soils hold by volume. It fits a relative reading from a capacitance probe. Calibrate it first."},
    {"n": 7, "title": "No sources", "detail": "The pasted text lists no references, so its numbers have not been checked against a study."},
    {"n": 8, "title": "Chemical doses", "detail": "Foliar and growth-regulator doses are shown as the document gives them. Confirm with an agronomist, and check which products are legal."},
    {"n": 9, "title": "Stage 1 without stress", "detail": "The stage table assumes withheld water. For bending, pruning or chemical methods it gives no moisture target; the app uses the general 55-75 %."},
    {"n": 10, "title": "Soil N, P, K", "detail": "The document gives nutrient removal per tonne of fruit, not soil targets, and a low-cost probe cannot measure them well. They are shown but not rated."},
]


def days_between(start: date, today: date) -> int:
    """Cycle day: the start date is day 1."""
    return (today - start).days + 1
