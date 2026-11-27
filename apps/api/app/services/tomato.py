"""Tomato farming agronomy constants, targets, setups, stages, diseases, and condition evaluators."""
from __future__ import annotations

from datetime import date, datetime

SLUG = "tomato"
NAME = "Tomato"
CYCLE_DAYS = 110
KHR_PER_USD = 4080
EXPECTED_KG_PER_PLANT = 4.5
DEFAULT_PRICE_USD_PER_KG = 0.80
UNIT_COST_USD = 0.82
LITRES_PER_PLANT_CYCLE = 115

TARGETS: dict[str, tuple[float, float]] = {
    "soil_ph": (6.0, 6.8),
    "soil_moisture": (58.0, 72.0),
    "soil_ec": (0.8, 2.5),
    "soil_temperature": (18.0, 29.0),
    "nitrogen": (80.0, 140.0),
    "phosphorus": (55.0, 85.0),
    "potassium": (160.0, 230.0),
    "air_temperature": (18.0, 32.0),
    "air_humidity": (50.0, 85.0),
}

PARAM_META: tuple[tuple[str, str, str, str, int], ...] = (
    ("soil_moisture", "Soil moisture", "Moisture", "%", 1),
    ("soil_ph", "Soil pH", "pH", "pH", 2),
    ("soil_ec", "Soil EC", "EC", "mS/cm", 2),
    ("soil_temperature", "Soil temperature", "Soil °C", "°C", 1),
    ("nitrogen", "Nitrogen", "N", "mg/kg", 0),
    ("phosphorus", "Phosphorus", "P", "mg/kg", 0),
    ("potassium", "Potassium", "K", "mg/kg", 0),
    ("air_temperature", "Air temperature", "Air °C", "°C", 1),
    ("air_humidity", "Air humidity", "RH", "%", 1),
)

TOMATO_SETUPS = [
    {
        "id": "greenhouse_a",
        "label": "Greenhouse Trellis Beds",
        "method": "pruning",
        "density": [35, 45],
        "kgPerPlant": [4.2, 5.0],
        "referenceBedM2": 50.0,
        "plantsPerReferenceBed": [18, 22],
        "kgPerReferenceBed": [76.0, 110.0],
        "rowCm": 100,
        "plantCm": 50,
        "spacingPlantsPerM2": 2.0,
        "basis": "AgriRover greenhouse tomato trellis standard",
        "spacingBasis": "50 cm plant spacing in 100 cm drip rows",
    },
    {
        "id": "commercial",
        "label": "Drip Row Commercial",
        "method": "pruning",
        "density": [90, 110],
        "kgPerPlant": [4.0, 4.8],
        "referenceBedM2": 50.0,
        "plantsPerReferenceBed": [15, 20],
        "kgPerReferenceBed": [65.0, 96.0],
        "rowCm": 120,
        "plantCm": 50,
        "spacingPlantsPerM2": 1.7,
        "basis": "Open commercial tomato drip row target",
        "spacingBasis": "Raised mulched drip rows",
    },
    {
        "id": "raised_bed",
        "label": "Raised Mulched Beds",
        "method": "pruning",
        "density": [140, 180],
        "kgPerPlant": [4.2, 4.8],
        "referenceBedM2": 50.0,
        "plantsPerReferenceBed": [16, 20],
        "kgPerReferenceBed": [70.0, 95.0],
        "rowCm": 100,
        "plantCm": 45,
        "spacingPlantsPerM2": 2.2,
        "basis": "Raised organic mulched tomato bed",
        "spacingBasis": "Mulched 100 cm raised bed",
    },
    {
        "id": "drip_plot",
        "label": "High-density Drip Plot",
        "method": "pruning",
        "density": [200, 260],
        "kgPerPlant": [3.8, 4.6],
        "referenceBedM2": 50.0,
        "plantsPerReferenceBed": [22, 26],
        "kgPerReferenceBed": [85.0, 115.0],
        "rowCm": 90,
        "plantCm": 40,
        "spacingPlantsPerM2": 2.5,
        "basis": "Intensive drip plot trellis",
        "spacingBasis": "90 × 40 cm precision drip layout",
    },
    {
        "id": "open_field",
        "label": "Open Field Beds",
        "method": "pruning",
        "density": [120, 160],
        "kgPerPlant": [3.6, 4.5],
        "referenceBedM2": 50.0,
        "plantsPerReferenceBed": [15, 20],
        "kgPerReferenceBed": [58.0, 88.0],
        "rowCm": 110,
        "plantCm": 50,
        "spacingPlantsPerM2": 1.8,
        "basis": "Prepared outdoor tomato plot",
        "spacingBasis": "Staked outdoor beds",
    },
]

SETUP_BY_ID = {s["id"]: s for s in TOMATO_SETUPS}

METHODS = [
    {"id": "pruning", "label": "Single/Double Stem Pruning", "note": "Standard indeterminate tomato trellis pruning."},
    {"id": "withhold", "label": "Controlled Drip Deficit", "note": "Tight moisture band to boost fruit brix."},
    {"id": "bending", "label": "Staked Bush Support", "note": "Heavy fruit truss tying & mulch cover."},
]
METHOD_IDS = {m["id"] for m in METHODS}

STAGES = [
    {"n": 1, "key": "vegetative", "short": "Vegetative", "title": "Seedling & vegetative", "firstDay": 1, "lastDay": 20, "moisture": [58.0, 72.0], "ec": [0.8, 1.8], "kc": 0.65, "etcPct": [65.0, 75.0], "water": "Light frequent drip to keep root plug evenly moist.", "feed": "Starter balanced feed once true roots establish.", "actions": "Inspect stem vigor and tie first trellis clip."},
    {"n": 2, "key": "flowering", "short": "Flowering", "title": "Flowering & early fruit set", "firstDay": 21, "lastDay": 48, "moisture": [58.0, 72.0], "ec": [0.8, 2.5], "kc": 0.90, "etcPct": [85.0, 95.0], "water": "Hold Moisture strictly in 58–72% to prevent flower drop & leaf curl.", "feed": "Moderate Potassium; hold Urea if probe N >= 105 mg/kg.", "actions": "Remove lower leaves below 25 cm and monitor flower trusses."},
    {"n": 3, "key": "fruit_set", "short": "Fruit Set", "title": "Early fruit development", "firstDay": 49, "lastDay": 60, "moisture": [58.0, 72.0], "ec": [1.0, 2.5], "kc": 1.05, "etcPct": [95.0, 105.0], "water": "Steady morning drip to safeguard Calcium flow to young tomatoes.", "feed": "K + chelated Ca focus; avoid high Ammonium/P antagonism.", "actions": "Pinch side suckers and check yellow sticky cards."},
    {"n": 4, "key": "bulking", "short": "Bulking", "title": "Fruit sizing & bulking", "firstDay": 61, "lastDay": 85, "moisture": [58.0, 72.0], "ec": [1.2, 2.5], "kc": 1.15, "etcPct": [100.0, 110.0], "water": "Consistent moisture prevents blossom-end rot & fruit cracking.", "feed": "Potassium Sulfate (K2SO4) priority for fruit sugar & firmness.", "actions": "Support heavy trusses and prune shaded interior leaves."},
    {"n": 5, "key": "ripening", "short": "Ripening", "title": "Ripening & harvest", "firstDay": 86, "lastDay": 110, "moisture": [58.0, 72.0], "ec": [1.2, 2.5], "kc": 0.95, "etcPct": [85.0, 95.0], "water": "Steady moderate drip; avoid sudden heavy soak near picking.", "feed": "Maintain probe balance without excess N flare.", "actions": "Pick breaker-to-red fruit cleanly & log harvest weights."},
]

JOBS = [
    {"id": "stake_install", "title": "Install trellis stakes & drip lines", "detail": "Secure drip tape 15 cm from stem base before transplanting.", "firstDay": 1, "lastDay": 5, "stageN": 1, "confirm": False, "measure": False, "ongoing": False},
    {"id": "sucker_prune_1", "title": "Prune first axillary suckers", "detail": "Snap off side shoots below first flower cluster cleanly.", "firstDay": 22, "lastDay": 30, "stageN": 2, "confirm": False, "measure": False, "ongoing": False},
    {"id": "lower_canopy_clear", "title": "Clear lower leaves < 25 cm", "detail": "Reduces soil-splash Alternaria (Early blight) pressure.", "firstDay": 32, "lastDay": 45, "stageN": 2, "confirm": False, "measure": False, "ongoing": False},
    {"id": "calcium_truss_check", "title": "Inspect green fruit blossom ends", "detail": "Verify steady 58–72% moisture & pH 6.0–6.8 for Ca uptake.", "firstDay": 50, "lastDay": 65, "stageN": 3, "confirm": False, "measure": False, "ongoing": False},
    {"id": "harvest_ready", "title": "Harvest ripening tomato trusses", "detail": "Record marketable & culled kg per block after picking.", "firstDay": 85, "lastDay": 110, "stageN": 5, "confirm": False, "measure": True, "ongoing": True},
]

DISEASES = [
    {"id": "early_blight", "title": "Early blight", "kind": "fungus", "leaf": "Brown concentric target spots with yellow halo on lower leaves.", "fruit": "Sunken dark leathery spots near calyx if unchecked.", "notToConfuse": "Natural lower-leaf senescence (uniform yellow without rings).", "favours": "Warm humidity and splash onto leaves below 25 cm.", "do": "Prune below 25 cm + Mix 5.0 g/L Bacillus subtilis WP (140–180 mL/plant).", "sources": [{"title": "AgriRover Tomato IPM Guide", "url": "/crop?tab=guide#early_blight"}], "symptom": "leaf_spot", "thin": False, "card": {"group": "fungus", "signs": "Dark target rings on lower leaves", "steps": ["Cut leaves below 25 cm", "Spray 5.0 g/L Bacillus subtilis WP", "Hold 0 g extra Urea/N"], "askFirst": False}},
    {"id": "leaf_curl", "title": "Leaf curl", "kind": "water", "leaf": "Upward cupping of young upper leaves and stiff margins.", "fruit": "Reduced fruit set under severe heat/TYLCV pressure.", "notToConfuse": "Normal evening leaf fold.", "favours": "Soil moisture drop (< 58%), heat, high EC, or whiteflies.", "do": "Trigger (64 - Moisture) * 0.25 L drip pulse + 3.0 mL/L Neem oil at 05:00 PM.", "sources": [{"title": "AgriRover Tomato IPM Guide", "url": "/crop?tab=guide#leaf_curl"}], "symptom": "leaf_curl", "thin": False, "card": {"group": "water", "signs": "Curled leathery upper shoots", "steps": ["Pulse (64 - Moisture) * 0.25 L drip", "Mix 3.0 mL/L Neem + 1.0 mL/L soap", "Hang yellow sticky cards"], "askFirst": False}},
    {"id": "yellow_leaves", "title": "Yellow leaves (N / nutrient uptake)", "kind": "feed", "leaf": "Pale chlorosis starting on older lower leaves.", "fruit": "Smaller fruit if true Nitrogen (< 80 mg/kg) or Potassium (< 160 mg/kg) deficit.", "notToConfuse": "Excess N (> 105 mg/kg) where older leaves senesce naturally.", "favours": "True low N/K, saturated roots (> 72% moisture), or off-range pH.", "do": "Check probe N/K first: seaweed foliar if N >= 80, Calcium Nitrate drip if N < 80.", "sources": [{"title": "AgriRover Tomato IPM Guide", "url": "/crop?tab=guide#yellow_leaves"}], "symptom": "chlorosis", "thin": False, "card": {"group": "feed", "signs": "Yellow lower canopy leaves", "steps": ["Check live Soil N (skip Urea if >= 105)", "Seaweed 3 mL/L + micros 1 g/L OR Ca(NO3)2 drip if N < 80", "Prune yellow basal leaves"], "askFirst": False}},
    {"id": "blossom_end_rot", "title": "Blossom-end rot", "kind": "feed", "leaf": "Healthy foliage; physiological Ca deficit on young fruit.", "fruit": "Dark sunken flat patch at blossom end of green tomatoes.", "notToConfuse": "Late blight wet rot.", "favours": "pH < 6.0, high Phosphorus (> 85 mg/kg), or fluctuating moisture.", "do": "Mix 2.5 g/L Calcium Chloride foliar (180 mL/plant); avoid DAP/MAP.", "sources": [{"title": "AgriRover Tomato IPM Guide", "url": "/crop?tab=guide#blossom_end_rot"}], "symptom": "fruit_rot", "thin": False, "card": {"group": "feed", "signs": "Dark sunken patch at fruit bottom", "steps": ["Remove affected fruit", "Spray 2.5 g/L CaCl2 on trusses", "Do NOT add DAP/MAP/Phosphate"], "askFirst": False}},
    {"id": "pest_damage", "title": "Pest damage — Leafminer / Whitefly", "kind": "insect", "leaf": "White winding tunnels (Liriomyza) or honeydew on leaf undersides.", "fruit": "Indirect vigor loss if untreated.", "notToConfuse": "Sunburn silvering.", "favours": "High N/K lush foliage in warm greenhouse pockets.", "do": "Pinch heavily mined leaves + 3.0 mL/L Neem oil + 1.0 mL/L soap at 05:00 PM.", "sources": [{"title": "AgriRover Tomato IPM Guide", "url": "/crop?tab=guide#pest_damage"}], "symptom": "pest", "thin": False, "card": {"group": "insect", "signs": "Pale winding leaf tunnels", "steps": ["Pinch mined leaves", "Spray 3.0 mL/L Neem + 1.0 mL/L soap", "Hold extra N/K"], "askFirst": False}},
]

SYMPTOMS = {
    "yellow_leaves": "Yellowing lower tomato leaves",
    "leaf_curl": "Upward curling shoot tips",
    "leaf_spot": "Dark brown leaf spots",
    "fruit_rot": "Dark sunken blossom-end fruit patch",
    "pest": "Leafminer tunnels / whitefly activity",
}

PARAM_RULES = [
    {"label": "Soil pH", "target": "6.0 – 6.8", "critical": "< 5.5 or > 7.5", "note": "Unlocks Ca, Mg & micronutrients."},
    {"label": "Soil Moisture", "target": "58 – 72%", "critical": "< 52% or > 78%", "note": "Triggers auto precision drip pulse when < 58%."},
    {"label": "Soil EC", "target": "0.8 – 2.5 mS/cm", "critical": "> 3.2 mS/cm", "note": "Prevents osmotic root burn during fruiting."},
    {"label": "Soil Temperature", "target": "18 – 29 °C", "critical": "> 33 °C", "note": "Straw mulch keeps shallow feeder roots cool."},
]

LEAF_RANGES = [
    {"nutrient": "Nitrogen (N)", "range": "3.5 – 5.0 %"},
    {"nutrient": "Phosphorus (P)", "range": "0.3 – 0.7 %"},
    {"nutrient": "Potassium (K)", "range": "2.8 – 4.5 %"},
    {"nutrient": "Calcium (Ca)", "range": "1.2 – 2.5 %"},
    {"nutrient": "Magnesium (Mg)", "range": "0.3 – 0.8 %"},
]


def stage_of(day: int | None) -> dict:
    d = max(1, day or 1)
    for st in STAGES:
        if st["firstDay"] <= d <= st["lastDay"]:
            return st
    return STAGES[-1]


def days_between(planted_on: str | date, today: date) -> int:
    if isinstance(planted_on, str):
        p = date.fromisoformat(planted_on[:10])
    else:
        p = planted_on
    return max(1, (today - p).days + 1)


def rate_metric(metric: str, val: float | None) -> tuple[str, str | None]:
    if val is None or metric not in TARGETS:
        return ("no_data" if val is None else "unrated"), None
    lo, hi = TARGETS[metric]
    if val < lo:
        return ("critical" if val < lo * 0.92 else "warning"), "low"
    if val > hi:
        return ("critical" if val > hi * 1.12 else "warning"), "high"
    return "normal", None


def cycle_forecast(cycle: dict) -> dict | None:
    plants = cycle.get("plantCount") or 0
    if plants <= 0:
        return None
    price = float(cycle.get("expectedPriceUsdPerKg") or DEFAULT_PRICE_USD_PER_KG)
    kg_mid = round(plants * EXPECTED_KG_PER_PLANT, 1)
    kg_low = round(plants * 4.2, 1)
    kg_high = round(plants * 4.8, 1)
    return {
        "setup": cycle.get("setup") or "commercial",
        "label": cycle.get("setupLabel") or "Tomato Bed",
        "plants": plants,
        "kgLow": kg_low,
        "kgHigh": kg_high,
        "kgMid": kg_mid,
        "pricePerKgUsd": price,
        "revenueLowUsd": round(kg_low * price, 2),
        "revenueHighUsd": round(kg_high * price, 2),
        "basis": "4.5 kg/plant tomato cycle benchmark",
    }


def cycle_public_dict(c: dict, today: date) -> dict:
    status = c.get("status", "active")
    day = None
    st = None
    if status == "active":
        day = days_between(c["plantedOn"], today)
        st = stage_of(day)
    return {
        "id": c["id"],
        "zone": c["zone"],
        "bedLabel": c["bedLabel"],
        "trialArm": c.get("trialArm"),
        "crop": SLUG,
        "cropName": NAME,
        "variety": c.get("variety"),
        "plantedOn": c["plantedOn"],
        "endedOn": c.get("endedOn"),
        "status": status,
        "day": day,
        "stage": st["key"] if st else None,
        "stageTitle": st["title"] if st else None,
        "plantCount": c.get("plantCount"),
        "areaM2": c.get("areaM2"),
        "setup": c.get("setup"),
        "setupLabel": c.get("setupLabel"),
        "expectedPriceUsdPerKg": c.get("expectedPriceUsdPerKg", DEFAULT_PRICE_USD_PER_KG),
        "forecast": cycle_forecast(c),
        "grid": c.get("grid"),
    }


def setup_to_dict(s: dict, area: float | None = None) -> dict:
    out = dict(s)
    out["plantsForArea"] = round(area * s["spacingPlantsPerM2"]) if area else None
    return out
