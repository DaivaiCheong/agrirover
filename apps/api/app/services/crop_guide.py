"""What a crop needs, and the plan a farmer gets from one number: how many plants.

Only tomato has a guide so far. Every statement carries where it comes from:
  "study:<key>"  a source in SOURCES that says it (and how much of that source was read)
  "practice"     ordinary growing practice, not taken from a study listed here
Numbers from Japanese prefectural trials describe greenhouse growing in a cool climate, not open
fields in Cambodia, and the screen says so. The water itself comes from the FAO-56 method with
Siem Reap weather (services/climate.py); the Japanese figures are used to check it, not to drive it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from app.services import climate
from app.services import water_plan as wp


@dataclass(frozen=True)
class Source:
    key: str
    label: str
    url: str
    read: str            # how much of it was actually read
    supports: str


SOURCES = {s.key: s for s in (
    Source("aomori", "Aomori Prefectural Agriculture and Forestry Research Institute (Japan), 2024: irrigation "
           "volume and solar radiation on summer-autumn tomato growers' farms",
           "https://www.pref.aomori.lg.jp/soshiki/nourin/nosui/files/R6-ys3.pdf", "read in full",
           "Water per plant by sunshine, peak 2.2-3.0 L, soil moisture target, yields, days to first picking. "
           "One skilled grower in a greenhouse, cool climate; the water-and-sunshine fit is loose (R2 0.51)."),
    Source("fukushima", "Fukushima Agricultural Experiment Station (Japan): soil-moisture controlled irrigation "
           "of summer-autumn tomato (1996-98) and pF-sensor fertigation (2004)",
           "https://www.pref.fukushima.lg.jp/uploaded/attachment/447910.pdf", "read in full (two short summaries)",
           "Soil moisture targets (pF 2.2-2.4 until the third flower truss, 2.0 after); sensor depth 10 cm; "
           "irrigation at 06:00 and 07:00."),
    Source("hiroshima", "Hiroshima Prefectural Agricultural Research Center (Japan), 2001: fertigation guide "
           "for tomato", "https://www.pref.hiroshima.lg.jp/uploaded/attachment/545012.pdf",
           "partly read: the PDF's Japanese font would not decode. The 3.4 L peak and the cloudy 2/3 and "
           "rainy 1/3-to-0 rule come from a search-engine quotation and match the numbers visible in the PDF",
           "Peak 3.4 L per plant on sunny days in midsummer; cloudy days two-thirds, rainy days one-third or none."),
    Source("kumamoto", "Kumamoto Prefecture (Japan), Agri-Kumamoto: irrigation of summer-autumn tomato and pepper",
           "https://agri-kumamoto.jp/cultivation/data/%E5%A4%8F%E7%A7%8B%E3%83%88%E3%83%9E%E3%83%88%E3%80%81"
           "%E3%83%94%E3%83%BC%E3%83%9E%E3%83%B3%E3%81%AE%E3%81%8B%E3%82%93%E6%B0%B4%E6%96%B9%E6%B3%95%E3%81%AB"
           "%E3%81%A4%E3%81%84%E3%81%A6/", "read in full (one web page)",
           "When to water: early morning, not midday, not evening unless the soil is very dry."),
    Source("yamaguchi", "Yamaguchi Prefecture (Japan), 2020: automatic irrigation for high-sugar tomato",
           "https://www.pref.yamaguchi.lg.jp/uploaded/attachment/61636.pdf", "read in full (two pages)",
           "A dry bed edge raises blossom-end rot."),
    Source("rua", "Ro S. et al. (2021), Royal University of Agriculture, Cambodia. Plants 10(3):449, "
           "doi:10.3390/plants10030449 (open access)", "https://www.mdpi.com/2223-7747/10/3/449",
           "read: abstract, methods and results text",
           "Cambodian trial: 50 x 70 cm spacing; the CARDI fertiliser rate; March-June heat cut fruit setting; "
           "the local varieties KK1 and Neang Tamm held up best in heat."),
    Source("nasa", "NASA POWER daily weather for Siem Reap, 2015-2024; ET0 by FAO-56 Penman-Monteith",
           "https://power.larc.nasa.gov/", "downloaded and computed here; the method reproduces FAO-56's worked "
           "Example 18 (3.88 mm/day)", "Monthly ET0, average daily high and rain for Siem Reap."),
    Source("fao56", "Allen et al. (1998), FAO Irrigation and Drainage Paper 56",
           "https://www.fao.org/4/x0490e/x0490e00.htm", "method and tomato tables as used earlier in this project",
           "Crop coefficients (Kc) and stage lengths: ETc = Kc x ET0."),
)}


@dataclass(frozen=True)
class Task:
    first_day: int
    last_day: int
    text: str
    basis: str


@dataclass(frozen=True)
class StageText:
    stage: str           # one of water_plan.STAGES
    title: str
    plain: str
    watch: str
    basis: str


@dataclass(frozen=True)
class CropGuide:
    slug: str
    spacing_cm: tuple[int, int]
    stages: tuple[StageText, ...]
    tasks: tuple[Task, ...]
    first_pick_day: int
    feed_kg_ha: dict          # N, P2O5, K2O at the trial's rate
    compost_t_ha: float
    mulch_t_ha: float
    split: tuple[tuple[str, float, str], ...]      # when, share of the nitrogen, task text


TOMATO = CropGuide(
    slug="tomato",
    spacing_cm=(50, 70),                           # the Cambodian trial: 0.35 m2 per plant, 28,571 plants per ha
    stages=(
        StageText("initial", "Settling in",
                  "Roots spread and the first leaves grow. The plants drink little, but the soil must not dry out.",
                  "", "practice"),
        StageText("development", "Growing and flowering",
                  "Plants grow fast, flowers open and the first fruit sets. Water rises every day.",
                  "Heat stops fruit from setting: in Cambodian trials fruit setting fell in March-June heat.",
                  "study:rua"),
        StageText("mid-season", "Heavy picking",
                  "The thirstiest weeks: full leaf cover and fruit filling.",
                  "Uneven watering or a dry bed edge causes blossom-end rot, the black patch at the fruit's base.",
                  "study:yamaguchi"),
        StageText("late season", "Finishing",
                  "Water use falls as the plants age. Keep picking until yield drops.",
                  "Stop watering when you stop picking, then close this crop here so its costs are final.",
                  "practice"),
    ),
    tasks=(
        Task(1, 2, "Water the seedlings in well. From the next day, water every day.", "study:aomori"),
        Task(1, 7, "Spread rice straw over the bed, about 1 kg per m2 (the Cambodian trial used 10 tonnes per hectare).",
             "study:rua"),
        Task(1, 1, "First feed: all the compost, all the phosphate and potash, and half of the nitrogen "
                   "(amounts are in the feed table).", "study:rua"),
        Task(14, 110, "Support plants with stakes or string and take off side shoots about once a week, "
                      "if you grow tall varieties.", "practice"),
        Task(28, 42, "When the first flowers open, second feed: a quarter of the nitrogen.", "study:rua"),
        Task(49, 63, "After the first picking, third feed: the last quarter of the nitrogen.", "study:rua"),
        Task(49, 135, "Pick ripe fruit. In Aomori the first picking came 49-53 days after planting; "
                      "check your own variety.", "study:aomori"),
        Task(135, 135, "Last day of this plan. Tall varieties are topped (growing tip pinched off) at about day "
                       "135-144 in Aomori. Close the crop in the app after the last picking.", "study:aomori"),
    ),
    first_pick_day=49,
    feed_kg_ha={"N": 75.0, "P2O5": 30.0, "K2O": 100.0},       # CARDI recommendation as used by Ro et al. 2021
    compost_t_ha=20.0,
    mulch_t_ha=10.0,
    split=(("At planting", 0.50, "Compost, all phosphate and potash, half the nitrogen"),
           ("At first flowers", 0.25, "A quarter of the nitrogen"),
           ("After the first picking", 0.25, "The last quarter of the nitrogen")),
)

GUIDES = {TOMATO.slug: TOMATO}

# Fertiliser grades used to turn nutrients into things a shop sells (standard grades).
UREA_N, TSP_P2O5, MOP_K2O = 0.46, 0.46, 0.60

# Aomori: 204 plants per are (100 m2) = 2,040 per 10 a. Yields in tonnes per 10 a.
AOMORI_PLANTS_PER_10A = 2040
AOMORI_YIELDS = (("Regional average", 11.0), ("A good grower (2022)", 15.0), ("The best grower (2021)", 18.0))
AOMORI_LITRES_PER_PLANT_PEAK = (2.2, 3.0)                  # peak day, 2022 and 2021
AOMORI_AREA_PER_PLANT_M2 = 100 / 204

HOT_MONTHS = (3, 4, 5, 6)                                  # the Cambodian trial's high-temperature window
RAIN_MONTHS = (5, 6, 7, 8, 9, 10)
CLOUDY_SHARE, RAINY_SHARE = 2 / 3, 1 / 3                   # Hiroshima


NO_GUIDE_SPACING_CM = (50, 100)                              # a crop with water data but no guide


def default_area_per_plant_m2(slug: str) -> float:
    """Ground one plant is assumed to get when the farmer gives no area: the guide's spacing, else 50 x 100 cm."""
    guide = GUIDES.get(slug)
    row_cm, plant_cm = guide.spacing_cm if guide else NO_GUIDE_SPACING_CM
    return row_cm * plant_cm / 10_000


def stage_of(crop: wp.CropWater, day: int | None) -> tuple[str, str] | None:
    """(FAO stage name, the farmer's name for it) for a crop day, or None outside the crop's life."""
    if day is None or not 1 <= day <= sum(crop.stage_days):
        return None
    name = wp.stage_for_day(crop, day)
    guide = GUIDES.get(crop.id)
    title = next((s.title for s in guide.stages if s.stage == name), None) if guide else None
    return name, title or name.capitalize()


def _r(v: float, n: int = 1) -> float:
    return round(v, n)


def _on(planted_on: date, day: int) -> str:
    return (planted_on + timedelta(days=day - 1)).isoformat()


def _task(t: Task, planted_on: date) -> dict:
    return {"text": t.text, "firstDay": t.first_day, "lastDay": t.last_day, "startsOn": _on(planted_on, t.first_day),
            "endsOn": _on(planted_on, t.last_day), "basis": t.basis}


def _weeks(p: wp.WaterPlan, planted_on: date) -> list[dict]:
    out = []
    for i in range(0, len(p.days), 7):
        rows = p.days[i:i + 7]
        out.append({"week": i // 7 + 1, "startsOn": _on(planted_on, rows[0].day), "firstDay": rows[0].day,
                    "stage": rows[len(rows) // 2].stage,
                    "litersPerDay": _r(sum(r.liters_total_gross for r in rows) / len(rows)),
                    "litersPerPlantPerDay": _r(sum(r.liters_per_plant_gross for r in rows) / len(rows), 2),
                    "et0MmDay": _r(sum(r.et0_mm for r in rows) / len(rows), 2)})
    return out


def _season(planted_on: date, days: int) -> dict:
    dates = [planted_on + timedelta(days=i) for i in range(days)]
    hot = sum(1 for d in dates if d.month in HOT_MONTHS)
    rainy = sum(1 for d in dates if d.month in RAIN_MONTHS)
    months = []
    for d in dates:
        key = (d.year, d.month)
        if not months or months[-1]["key"] != key:
            months.append({"key": key, "month": d.month, "days": 0})
        months[-1]["days"] += 1
    notes = []
    if hot / days > 0.25:
        notes.append({"kind": "warn", "basis": "study:rua",
                      "text": f"{hot} of the {days} days fall in March-June. In the Royal University of Agriculture "
                              f"trials the air reached 38.8 C in those months and tomato set less fruit. Choose a "
                              f"heat-tolerant variety (the local KK1 and Neang Tamm held up best) or plant earlier: "
                              f"their cooler-season trial ran December-March."})
    elif hot:
        notes.append({"kind": "note", "basis": "study:rua",
                      "text": f"The last {hot} days fall in March-June, when it gets hot enough to cut fruit setting "
                              f"in Cambodian trials."})
    if rainy:
        notes.append({"kind": "note", "basis": "study:hiroshima",
                      "text": f"{rainy} days fall in the rainy months (May-October). The water plan ignores rain, so "
                              f"on rainy days give one-third or none."})
    return {"hotDays": hot, "rainyDays": rainy, "notes": notes,
            "months": [{"month": m["month"], "days": m["days"], "et0MmDay": climate.ET0_MM_DAY[m["month"]],
                        "avgHighC": climate.TMAX_C[m["month"]], "rainMmDay": climate.RAIN_MM_DAY[m["month"]]}
                       for m in months]}


def _feed(guide: CropGuide, plants: int, area_per_plant_m2: float) -> dict:
    """Nutrients are per area, so the amount per plant follows the spacing."""
    g_per_m2 = {k: v * 1000 / 10_000 for k, v in guide.feed_kg_ha.items()}          # kg/ha -> g/m2
    per_plant = {k: v * area_per_plant_m2 for k, v in g_per_m2.items()}
    compost_kg_plant = guide.compost_t_ha * 1000 / 10_000 * area_per_plant_m2
    mulch_kg_plant = guide.mulch_t_ha * 1000 / 10_000 * area_per_plant_m2
    rows = []
    for i, (when, n_share, what) in enumerate(guide.split):
        n = per_plant["N"] * n_share
        row = {"when": when, "what": what, "nitrogenG": _r(n, 2), "urea46G": _r(n / UREA_N, 1)}
        if i == 0:
            row |= {"compostKg": _r(compost_kg_plant, 2), "phosphateG": _r(per_plant["P2O5"], 2),
                    "tspG": _r(per_plant["P2O5"] / TSP_P2O5, 1), "potashG": _r(per_plant["K2O"], 2),
                    "mopG": _r(per_plant["K2O"] / MOP_K2O, 1)}
        rows.append(row)
    totals = {"compostKg": _r(compost_kg_plant * plants, 1), "mulchKg": _r(mulch_kg_plant * plants, 1),
              "ureaKg": _r(per_plant["N"] / UREA_N * plants / 1000, 2),
              "tspKg": _r(per_plant["P2O5"] / TSP_P2O5 * plants / 1000, 2),
              "mopKg": _r(per_plant["K2O"] / MOP_K2O * plants / 1000, 2)}
    return {"rows": rows, "totalsForAllPlants": totals,
            "note": ("Rates are per area (N : P2O5 : K2O = 75 : 30 : 100 kg per hectare plus 20 t of compost), "
                     "scaled to your spacing. A soil test is better than any table. Urea is 46% N, triple "
                     "superphosphate 46% P2O5 and potash 60% K2O."), "basis": "study:rua"}


def build_plan(*, crop: wp.CropWater, guide: CropGuide | None, plants: int, planted_on: date, today: date,
               efficiency: float = 0.9, spacing_cm: tuple[float, float] | None = None,
               area_per_plant_m2: float | None = None) -> dict:
    """The whole plan for `plants` plants of `crop` planted on `planted_on`."""
    if area_per_plant_m2 is None:
        row_cm, plant_cm = spacing_cm or (guide.spacing_cm if guide else NO_GUIDE_SPACING_CM)
        area_per_plant_m2 = row_cm * plant_cm / 10_000
    n = sum(crop.stage_days)
    p = wp.plan(crop, plants, area_per_plant_m2, None, efficiency, et0_series=climate.et0_series(planted_on, n))

    day = wp.crop_day(planted_on, today)
    now: dict
    if day < 1:
        now = {"state": "not_planted", "startsInDays": 1 - day}
    elif day > n:
        now = {"state": "finished", "daysAgo": day - n}
    else:
        row = p.days[day - 1]
        now = {"state": "growing", "day": day, "daysLeft": n - day, "stage": row.stage,
               "litersToday": _r(row.liters_total_gross), "litersPerPlant": _r(row.liters_per_plant_gross, 2),
               "ifCloudy": _r(row.liters_total_gross * CLOUDY_SHARE), "ifRainy": _r(row.liters_total_gross * RAINY_SHARE),
               "tasks": [], "next": None}
        if guide:
            st = next(s for s in guide.stages if s.stage == row.stage)
            now |= {"stageTitle": st.title, "stagePlain": st.plain}
            now["tasks"] = [_task(t, planted_on) for t in guide.tasks if t.first_day <= day <= t.last_day]
            upcoming = sorted((t for t in guide.tasks if t.first_day > day), key=lambda t: t.first_day)
            if upcoming:
                now["next"] = _task(upcoming[0], planted_on) | {"inDays": upcoming[0].first_day - day}

    peak_mm = max(r.etc_mm for r in p.days)
    lo, hi = (v / AOMORI_AREA_PER_PLANT_M2 for v in AOMORI_LITRES_PER_PLANT_PEAK)
    stage_rows = []
    for name in wp.STAGES:
        rows = [r for r in p.days if r.stage == name]
        text = next((s for s in guide.stages if s.stage == name), None) if guide else None
        stage_rows.append({"stage": name, "title": text.title if text else name.capitalize(),
                           "plain": text.plain if text else None, "watch": (text.watch or None) if text else None,
                           "watchBasis": text.basis if text else None,
                           "firstDay": rows[0].day, "lastDay": rows[-1].day,
                           "startsOn": _on(planted_on, rows[0].day), "endsOn": _on(planted_on, rows[-1].day),
                           "days": len(rows), "grossM3": _r(sum(r.liters_total_gross for r in rows) / 1000, 2),
                           "avgLitersPerPlantPerDay": _r(sum(r.liters_per_plant_gross for r in rows) / len(rows), 2),
                           "tasks": [_task(t, planted_on) for t in guide.tasks
                                     if rows[0].day <= t.first_day <= rows[-1].day] if guide else []})

    out = {
        "crop": crop.name, "slug": crop.id, "hasGuide": guide is not None,
        "plants": plants, "plantedOn": planted_on.isoformat(), "endsOn": _on(planted_on, n), "cycleDays": n,
        "areaPerPlantM2": _r(area_per_plant_m2, 3), "areaM2": _r(area_per_plant_m2 * plants, 1),
        "now": now,
        "water": {
            "grossM3": _r(p.gross_m3, 2), "netM3": _r(p.net_m3, 2), "efficiency": efficiency,
            "perPlantWholeCycleL": _r(p.gross_m3 * 1000 / plants, 0),
            "peakLitersPerDay": _r(p.peak_liters_per_day, 0),
            "avgEt0MmDay": _r(p.et0_mm_day, 2), "et0Source": climate.SOURCE, "rainIgnored": True,
            "days": [{"day": r.day, "stage": r.stage, "et0Mm": _r(r.et0_mm, 2), "litersTotalGross": _r(r.liters_total_gross),
                      "litersPerPlantGross": _r(r.liters_per_plant_gross, 2)} for r in p.days],
            "weeks": _weeks(p, planted_on),
            "check": {"ourPeakMmDay": _r(peak_mm, 2), "japanMmDayRange": [_r(lo, 1), _r(hi, 1)],
                      "verdict": ("inside" if lo <= peak_mm <= hi
                                  else "close" if 0.9 * lo <= peak_mm <= 1.1 * hi else "outside"),
                      "japanLitersPerPlantPeak": list(AOMORI_LITRES_PER_PLANT_PEAK)},
        },
        "stages": stage_rows,
        "season": _season(planted_on, n),
        "kcSource": crop.source,
    }
    if guide:
        out["water"]["howTo"] = [
            {"text": "Water early in the morning. Photosynthesis starts 1-2 hours after sunrise; midday watering can "
                     "scald roots in hot soil; evening watering leaves the soil wet all night and invites disease "
                     "unless the soil is very dry.", "basis": "study:kumamoto"},
            {"text": "Cloudy day: about two-thirds of the sunny-day amount. Rainy day: one-third, or none.",
             "basis": "study:hiroshima"},
            {"text": "Japanese growers keep the soil moist but never wet: 1.8-2.4 on a pF tensiometer (about 6-25 kPa of "
                     "suction), depending on the growth stage and prefecture. This plan is the starting amount; on the "
                     "day, the soil sensor advice on Today decides.", "basis": "study:aomori"},
        ]
        out["feed"] = _feed(guide, plants, area_per_plant_m2)
        first, last = guide.first_pick_day, n
        out["harvest"] = {
            "firstPickDay": first, "firstPickOn": _on(planted_on, first), "lastDay": last, "lastOn": _on(planted_on, last),
            "basis": "study:aomori",
            "benchmark": {"label": "Japanese greenhouse growers, Aomori, 2,040 plants per 10 a",
                          "rows": [{"label": label, "tPer10a": t,
                                    "kgPerPlant": _r(t * 1000 / AOMORI_PLANTS_PER_10A, 1),
                                    "kgForYourPlants": _r(t * 1000 / AOMORI_PLANTS_PER_10A * plants, 0)}
                                   for label, t in AOMORI_YIELDS],
                          "caution": "These are Japanese greenhouse yields in a cool climate. An open field in Cambodia "
                                     "will usually give less, so use them as a ceiling to aim at, not a promise. "
                                     "Record your own harvests and the app shows your real cost per kg."},
        }
        out["tasks"] = [_task(t, planted_on) for t in guide.tasks]
    out["sources"] = [{"key": s.key, "label": s.label, "url": s.url, "read": s.read, "supports": s.supports}
                      for s in SOURCES.values() if guide or s.key in ("nasa", "fao56")]
    return out
