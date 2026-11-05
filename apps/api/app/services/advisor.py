"""What to tell the farmer after the rover's round: how much water each tree gets, whether to feed, what to look at.

Pure functions: no database and no clock. Advice only; nothing here opens a valve.

Water, to use as little as the stage allows:
    full demand = ET0 x Kc x stage share x ground per tree / drip efficiency      (FAO-56, the guava document's stage table)
    a tree in the upper half of its target gets nothing today; below that the amount rises to full demand at the
    bottom of the target. It never exceeds full demand, because more water does not make up a deficit at once:
    sudden water after a dry spell splits fruit. Rain falling means nothing today.
Feed, because too much burns and too little lowers the grade:
    each stage has a planned dose, split little and often, every 10 days (the Fujian practice). EC above the stage's
    target holds the feed; above 3.0 it asks for a leaching flush instead. N, P and K from the probe are never used:
    a low-cost probe cannot measure them well enough to set a dose (docs/GUAVA-RESEARCH.md).
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.services import guava
from app.services.guava import Setup, Stage

FEED_EVERY_DAYS = 10
# A share of the year's N, P, K for each stage. OUR split of the document's "high / low / none", to be tuned by leaf tests.
FEED_SHARE = {2: (0.50, 0.40, 0.15), 3: (0.15, 0.40, 0.25), 4: (0.35, 0.20, 0.40), 5: (0.0, 0.0, 0.20)}
HOT_AIR_C, HOT_FACTOR = 32.0, 1.10          # rules of thumb, not from a study: the day's air nudges the monthly ET0
HUMID_RH, HUMID_FACTOR = 85.0, 0.90
BEHIND_SHARE = 0.70                         # a tree under 70 % of the bed's leaf cover is falling behind
SOURCE = ("Water: FAO-56 with Siem Reap's monthly ET0 and the guava document's stages. Feed: the document's stages and setups, split every "
          "10 days. Starting rules, not field results.")


def full_demand_litres(stage: Stage, et0: float, area_per_tree: float, efficiency: float, stress: bool) -> float:
    """Litres one tree would use today at the stage's full demand. Stage 1 without stress waters like the flush."""
    if stage.n == 1:
        if stress:
            return 0.0
        stage = guava.STAGES[1]
    return et0 * stage.kc * (sum(stage.etc_pct) / 200) * area_per_tree / efficiency


def water_share(moisture: float | None, stage: Stage, stress: bool) -> float:
    """0 to 1 of full demand. Unknown soil gets full demand: a missing reading must not starve a tree."""
    if moisture is None:
        return 1.0
    low, high = guava.moisture_band(stage, stress)
    middle = (low + high) / 2
    if moisture >= middle:
        return 0.0
    if moisture <= low:
        return 1.0
    return (middle - moisture) / (middle - low)


def weather_factor(air_c: float | None, rh: float | None) -> float:
    factor = 1.0
    if air_c is not None and air_c > HOT_AIR_C:
        factor *= HOT_FACTOR
    if rh is not None and rh > HUMID_RH:
        factor *= HUMID_FACTOR
    return factor


@dataclass(frozen=True)
class WaterContext:
    stage: Stage
    stress: bool
    et0: float
    area_per_tree: float
    efficiency: float
    raining: bool = False


def tree_litres(ctx: WaterContext, readings: dict) -> tuple[float, float]:
    """(litres today, litres at full demand) for one tree."""
    full = full_demand_litres(ctx.stage, ctx.et0, ctx.area_per_tree, ctx.efficiency, ctx.stress)
    full *= weather_factor(readings.get("air_temperature"), readings.get("air_humidity"))
    if ctx.raining:
        return 0.0, full
    return full * water_share(readings.get("soil_moisture"), ctx.stage, ctx.stress), full


def _mean(values: Sequence[float]) -> float | None:
    return sum(values) / len(values) if values else None


def advise_trees(ctx: WaterContext, trees: Sequence[dict]) -> list[dict]:
    """One row per tree surveyed: its water today and anything to go and look at."""
    out = []
    ec_high = ctx.stage.ec[1]
    canopies = [t["canopy"] for t in trees if t.get("plant") and t.get("canopy") is not None]
    mean_canopy = _mean(canopies)
    for t in trees:
        row = {"row": t["row"], "col": t["col"], "plant": bool(t.get("plant")), "litres": 0.0, "fullLitres": 0.0, "notes": []}
        if not t.get("plant"):
            row["notes"].append("No tree seen")
            out.append(row)
            continue
        r = t.get("readings") or {}
        litres, full = tree_litres(ctx, r)
        row["litres"], row["fullLitres"] = round(litres, 1), round(full, 1)
        moisture, ec = r.get("soil_moisture"), r.get("soil_ec")
        low, _high = guava.moisture_band(ctx.stage, ctx.stress)
        if moisture is None:
            row["notes"].append("No probe reading")
        elif moisture < low and not ctx.stress:
            row["notes"].append("Dry")
        if ec is not None and ec > ec_high:
            row["notes"].append("Salty: no feed")
        if t.get("flagged"):
            row["notes"].append("Yellow leaves: look")
        if mean_canopy and t.get("canopy") is not None and t["canopy"] < BEHIND_SHARE * mean_canopy:
            row["notes"].append("Small canopy: look")
        out.append(row)
    return out


def feed_due(stage: Stage, day: int) -> tuple[bool, int | None]:
    """(due today, the next feed's cycle day). Stage 1 has no drip feed."""
    if stage.n == 1:
        return False, guava.STAGES[1].first_day
    offset = day - stage.first_day
    if offset % FEED_EVERY_DAYS == 0:
        return True, day
    following = day + FEED_EVERY_DAYS - offset % FEED_EVERY_DAYS
    if following <= stage.last_day:
        return False, following
    next_stage = next((s for s in guava.STAGES if s.n == stage.n + 1), None)
    return False, next_stage.first_day if next_stage else None


def feed_dose(stage: Stage, setup: Setup | None, trees: int) -> dict | None:
    """Grams of N, P, K for one feed run: the setup's yearly dose x the stage's share / the runs in the stage."""
    if stage.n == 1 or setup is None:
        return None
    share = FEED_SHARE[stage.n]
    days = stage.last_day - stage.first_day + 1
    runs = max(1, (days + FEED_EVERY_DAYS - 1) // FEED_EVERY_DAYS)
    per_tree = [round(y * s / runs, 1) for y, s in zip(setup.npk_g, share)]
    return {"runs": runs, "perTree": {"n": per_tree[0], "p": per_tree[1], "k": per_tree[2]},
            "total": {"n": round(per_tree[0] * trees), "p": round(per_tree[1] * trees), "k": round(per_tree[2] * trees)}}


def advise_feed(stage: Stage, day: int, setup: Setup | None, trees: int, ec: float | None, ph: float | None) -> dict:
    """Feed today, hold it, or flush. EC is the brake: it holds a feed that is due, and never raises a dose."""
    due, next_day = feed_due(stage, day)
    dose = feed_dose(stage, setup, trees)
    recipe = guava.fertigation_for(stage.n)
    notes = []
    if ph is not None and ph > 7.2:
        notes.append(f"pH {ph:.1f}: use an acidifying feed and keep feed water below 6.5")
    elif ph is not None and ph < 5.0:
        notes.append(f"pH {ph:.1f}: dolomite 1 kg a tree")

    if stage.n == 1:
        action, reason = "none", "No drip feed during this stage"
    elif ec is not None and ec > 3.0:
        action, reason = "flush", f"EC {ec:.2f} is above 3.0: too much salt. Clean water only, a leaching flush"
    elif ec is not None and ec > stage.ec[1]:
        action, reason = "hold", f"EC {ec:.2f} is above the {stage.ec[1]:g} target: enough feed in the soil. Skip it until it falls"
    elif due:
        action, reason = "feed", f"Due today. EC {ec:.2f} is under the {stage.ec[1]:g} limit" if ec is not None else "Due today. No EC reading: feed at the planned dose only"
    else:
        action, reason = "wait", f"Next feed on day {next_day}" if next_day else "No more feeds this cycle"
    if ec is not None and ec < stage.ec[0] and action in ("feed", "wait") and stage.n > 1:
        notes.append(f"EC {ec:.2f} is under the {stage.ec[0]:g} target: do not skip feeds, and take a leaf test before raising a dose")
    return {"action": action, "reason": reason, "due": due, "nextDay": next_day, "dose": dose if action == "feed" else None,
            "plannedDose": dose, "aim": recipe["aim"], "nitrogen": recipe["nitrogen"], "tanks": recipe["tanks"], "clash": recipe["clash"], "notes": notes}


def growth(rounds: Sequence[dict], stage: Stage) -> dict | None:
    """Leaf cover over the rover's rounds, oldest first. Each round: {"at", "canopy": bed mean, "yellow": flagged share}."""
    if not rounds:
        return None
    now = rounds[-1]
    first = rounds[0]
    change = now["canopy"] - first["canopy"]
    days = len(rounds) - 1
    # stress sheds leaves and the flush builds them; after that the canopy should hold
    if days < 3:
        verdict, word = "wip", "Too few rounds to say"
    elif stage.n == 1:
        verdict, word = ("ok", "Shedding as planned") if change <= 0.005 else ("warn", "Not shedding leaves: is the stress working?")
    elif stage.n == 2:
        verdict, word = ("ok", "Growing") if change > 0.005 else ("warn", "Not growing as the flush should")
    else:
        verdict, word = ("ok", "Holding") if change > -0.03 else ("warn", "Canopy shrinking")
    return {"canopyNow": round(now["canopy"], 3), "changePoints": round(change * 100, 1), "overDays": days, "verdict": verdict, "word": word,
            "yellowNow": round(now["yellow"], 3)}


def todo(*, trees: Sequence[dict], water_litres: float, feed: dict, stage: Stage, stress: bool, raining: bool, alerts: Sequence[dict], hours: float,
         firmware_limit_s: int) -> list[dict]:
    """The day's plain instructions for this bed, most urgent first."""
    out: list[dict] = []
    for a in alerts:
        if a["severity"] == "critical":
            out.append({"kind": "alert", "severity": "critical", "text": a["title"], "detail": a["message"]})
    living = [t for t in trees if t["plant"]]
    wet = [t for t in living if t["litres"] > 0]
    if stress and stage.n == 1:
        out.append({"kind": "water", "severity": "info", "text": "No water: stress on purpose", "detail": stage.water})
    elif raining:
        out.append({"kind": "water", "severity": "info", "text": "No water: it is raining", "detail": None})
    elif not living:
        pass
    elif wet:
        names = ", ".join(_cell(t) for t in wet[:6]) + (f" and {len(wet) - 6} more" if len(wet) > 6 else "")
        out.append({"kind": "water", "severity": "info", "text": f"Water {len(wet)} of {len(living)} trees: {water_litres:.0f} L",
                    "detail": f"{names}. About {hours:g} h of drip at most." + (f" The field node stops a run at {firmware_limit_s} s." if hours > 0 else "")})
    else:
        out.append({"kind": "water", "severity": "info", "text": "No water today: soil is in the upper half of its target", "detail": None})
    verb = {"feed": "Feed today", "hold": "Hold the feed", "flush": "Flush, do not feed"}.get(feed["action"])
    if verb:
        dose = feed["dose"]["total"] if feed.get("dose") else None
        amount = f": N {dose['n']} g, P {dose['p']} g, K {dose['k']} g" if dose else ""
        out.append({"kind": "feed", "severity": "warn" if feed["action"] != "feed" else "info", "text": verb + amount, "detail": feed["reason"]})
    for note in feed["notes"]:
        out.append({"kind": "feed", "severity": "warn", "text": note, "detail": None})
    for word, label in (("Yellow leaves", "yellow leaves"), ("Small canopy", "a small canopy")):
        marked = [t for t in living if any(n.startswith(word) for n in t["notes"])]
        if marked:
            names = ", ".join(_cell(t) for t in marked)
            count = f"{len(marked)} tree{'s' if len(marked) > 1 else ''}"
            out.append({"kind": "look", "severity": "warn", "text": f"Look at {count} with {label}", "detail": names})
    return out


def _cell(t: dict) -> str:
    return f"R{t['row'] + 1} T{t['col'] + 1}"
