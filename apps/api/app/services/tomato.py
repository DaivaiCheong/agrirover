"""What each reading should be on a tomato block: the targets, the rules, and why.

Used for a block whose plant map grows tomato (the rover demo). There is no growing-stage table for tomato yet, so the
targets are one band for the whole season, for a field or bed in the tropics. Same shape as guava.rate_bed, so the
Farm, Health and Rover screens rate a tomato block the same way.

N, P and K from the low-cost 7-in-1 probe are shown and never rated: the probe infers them from conductivity, so they
move with EC and water rather than with the nutrients. Nutrient balance (Mulder's chart: one nutrient in excess
blocks another) needs a lab test of leaves or soil, with calcium and magnesium, which the probe does not measure.
"""
from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime

from app.services.guava import FRESH_FOR, META, RANK, Band, Reading, _rate

SLUG = "tomato"
BASIS = "tomato_general"
SOURCE = ("Tomato, whole season, field or bed: pH 6.0-6.8 and root zone 20-26 °C from extension growing guides; "
          "salt tolerance ECe 2.5 dS/m (Maas & Hoffman 1977); fruit set 18-30 °C air, fails above about 32-35 °C. "
          "A starting reference, not checked on this farm yet.")


def is_tomato(crop: str | None) -> bool:
    return bool(crop and "tomato" in crop.lower())


# The moisture band uses the probe's own % scale, the same as the guava beds (saturation above 85). It is not a
# measured water content for this soil until the probe is checked against a dry and a wet sample.
BANDS: dict[str, Band | None] = {
    "soil_moisture": Band(60, 75, 45, 85),
    "soil_ph": Band(6.0, 6.8, 5.5, 7.5),
    "soil_ec": Band(1.0, 2.5, None, 4.0),
    "soil_temperature": Band(20, 26, 12, 32),
    "nitrogen": None, "phosphorus": None, "potassium": None,
    "air_temperature": Band(18, 30, 10, 35),
    "air_humidity": Band(60, 80, None, 90),
}

PARAM_RULES = (
    {"label": "Soil moisture", "target": "60-75 % on the probe, even from day to day",
     "critical": "Below 45 % (wilting), above 85 % (saturated roots)",
     "note": "Swings between dry and wet cause blossom-end rot and split fruit: water little and often"},
    {"label": "Soil pH", "target": "6.0-6.8", "critical": "Below 5.5, above 7.5",
     "note": "Below 5.5 calcium, magnesium and phosphorus run short (blossom-end rot). Above 7.5 iron, manganese and zinc lock up"},
    {"label": "Soil EC (dS/m = mS/cm)", "target": "1.0-2.5", "critical": "Above 4.0",
     "note": "Tomato yield falls about 10 % for each 1 dS/m above 2.5. Salt also slows calcium uptake. Below 1.0: feed is running low"},
    {"label": "Soil temperature", "target": "20-26 °C", "critical": "Below 12 °C, above 32 °C", "note": "Cold roots take up little phosphorus; mulch a hot bed"},
    {"label": "N, P, K", "target": "Trend only, never a dose", "critical": "None",
     "note": "The probe infers these from conductivity. Use a leaf or soil lab test, with calcium and magnesium"},
    {"label": "Air temperature", "target": "18-30 °C", "critical": "Below 10 °C, above 35 °C", "note": "Above about 32 °C flowers drop and pollen fails"},
    {"label": "Air humidity", "target": "60-80 %", "critical": "Above 90 %", "note": "Above 85 % leaf mould, grey mould and late blight spread; below 50 % pollen sticks poorly"},
    {"label": "Nutrients together (Mulder's chart)", "target": "Balanced, from a lab test", "critical": "None",
     "note": "Too much of one blocks another: high potassium blocks magnesium and calcium; high ammonium nitrogen blocks "
             "calcium and potassium; high phosphorus blocks zinc and iron; high calcium blocks magnesium and potassium. "
             "On tomato the one to watch is calcium (blossom-end rot). A qualitative guide, not a dose"},
)


def alerts_for(r: Mapping[str, float], *, recent_min: float | None) -> list[dict]:
    """Every rule that fires on these readings. A missing reading fires nothing. `hits` names the readings blamed."""
    out: list[dict] = []

    def add(alert_id: str, severity: str, title: str, message: str, hits: list[tuple[str, str]]) -> None:
        out.append({"id": alert_id, "severity": severity, "title": title, "message": message,
                    "metrics": [h[0] for h in hits], "hits": hits})

    m, ph, ec = r.get("soil_moisture"), r.get("soil_ph"), r.get("soil_ec")
    soil, air, rh = r.get("soil_temperature"), r.get("air_temperature"), r.get("air_humidity")

    if m is not None:
        if m > 85:
            add("saturation", "critical", "Saturated soil", f"Soil moisture {m:.1f} % is above 85 %. Stop watering: wet roots rot and wilt.", [("soil_moisture", "high")])
        elif m < 45:
            add("dry", "critical", "Dry soil, plants wilting", f"Soil moisture {m:.1f} % is below 45 %. Water now, then keep it even.", [("soil_moisture", "low")])
        if recent_min is not None and recent_min < 45 and m > 70:
            add("water_swing", "warning", "Blossom-end rot and split-fruit risk",
                f"Moisture went from {recent_min:.0f} % to {m:.0f} % in 3 days. Uneven water starves the fruit of calcium. Water little and often.", [("soil_moisture", "high")])
    if ph is not None:
        if ph < 5.5:
            add("acid", "critical", "Acid soil: calcium runs short", f"Soil pH {ph:.2f} is below 5.5. Calcium and magnesium are hard to take up: blossom-end rot. Lime the bed.", [("soil_ph", "low")])
        elif ph > 7.5:
            add("alkaline", "critical", "Alkaline soil", f"Soil pH {ph:.2f} is above 7.5: iron, manganese and zinc lock up (yellow young leaves).", [("soil_ph", "high")])
    if ec is not None:
        if ec > 4.0:
            add("salinity", "critical", "Salt stress", f"Soil EC {ec:.2f} is above 4.0: yield falls fast and calcium uptake slows. Flush with clean water.", [("soil_ec", "high")])
        elif ec > 2.5:
            add("salty", "warning", "Salt building up", f"Soil EC {ec:.2f} is above 2.5, where tomato yield starts to fall. Feed less, or flush.", [("soil_ec", "high")])
        elif ec < 1.0:
            add("low_ec", "warning", "Feed running low", f"Soil EC {ec:.2f} is below 1.0. Do not skip the next feed; check with a lab test.", [("soil_ec", "low")])
    if soil is not None and soil > 32:
        add("root_heat", "critical", "Hot root zone", f"Soil {soil:.1f} °C is above 32 °C. Mulch the bed.", [("soil_temperature", "high")])
    if air is not None:
        if air > 35:
            add("heat", "critical", "Too hot for fruit set", f"Air {air:.1f} °C is above 35 °C: pollen fails and flowers drop. Shade cloth, water in the morning.", [("air_temperature", "high")])
        elif air > 32:
            add("warm", "warning", "Hot for fruit set", f"Air {air:.1f} °C is above 32 °C: fewer flowers set fruit.", [("air_temperature", "high")])
    if rh is not None and rh > 85:
        add("fungal", "critical" if rh > 90 else "warning", "Fungal weather",
            f"Humidity {rh:.0f} %. Leaf mould, grey mould and late blight spread. Open the canopy, water the soil not the leaves.", [("air_humidity", "high")])
    return out


def rate_bed(readings: Mapping[str, Reading], *, now: datetime, recent_min: float | None = None) -> dict:
    """Readings in; a status per reading, the alerts, and the block's worst status out. The same shape as guava.rate_bed."""
    fresh = {k: r for k, r in readings.items() if now - r.at <= FRESH_FOR}
    raw = alerts_for({k: r.value for k, r in fresh.items()}, recent_min=recent_min)
    params = []
    for metric, (label, short, unit, decimals) in META.items():
        r = readings.get(metric)
        band = BANDS.get(metric)
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
    return {"status": worst, "rated": True, "basis": BASIS, "source": SOURCE, "params": params, "alerts": alerts,
            "stage": None, "rules": list(PARAM_RULES)}
