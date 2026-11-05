# Guava: requirements checklist

Source: the guava document pasted on 2026-11-05 ("Precision Pomology and Automated Production Management for Commercial Guava").
The pasted text lists no sources, so its numbers are labelled "guava document, not checked".

**Status 2026-11-05: guava runs on the real server, and tomato is gone.** Where a row below says Shown or Build, it was written when this was sample data: the rules, tasks, setups, fertigation and symptoms are now built on the server (`services/guava.py`, `services/advisor.py`). What remains open is the document's own questions at the end, and the rover hardware. Evidence: [GUAVA-RESEARCH.md](GUAVA-RESEARCH.md).

Status: **Shown** = you can see it working. **Build** = what was still needed when written. **Left out** = on purpose.

## Sensors and targets

| Requirement | Sample | Real version needs |
|---|---|---|
| Seven readings, ribbon, telemetry table, history | Shown | Nothing new: these already work for any crop |
| Target and critical limits per reading | Shown (Targets tab) | `agronomy.py` keeps limits as tomato constants; they must become per-crop data |
| Five stages over 180 days, moisture and EC per stage | Shown | Stage tables exist for tomato; add guava's |
| EC in dS/m | Shown (dS/m = mS/cm, same number) | Nothing |
| Inline irrigation water EC sensor | Not shown | Build: a second EC source on the fertigation line |
| Canopy sensor at 1.5 m, probe at 15-30 cm | Not shown | Hardware placement, no software |

## The cycle

| Requirement | Sample | Real version needs |
|---|---|---|
| Tree age separate from cycle day | Shown | Build: new columns. `planting.planted_on` is the only date today |
| Repeating cycles on the same trees | Partly: one cycle per bed shown | Build: an orchard record above the cycle |
| Bahar stress: 20-30 % is the target, not a fault | Shown | **Build: the watering rule must pause. Today it would say "Needs water" for the whole stress** |
| Two priming irrigations to end stress | Shown as a job | Build: schedule them |
| Choice of method (withhold, bending, pruning, chemical) | Shown | Build: a column; decide what each changes |
| Harvest season warning (rainy months) | Shown | Build: move the rule to the server |
| Stage jobs with Done | Shown | Build: jobs are read-only and have no "done" today |
| Bagging at 3-4 cm from a measured fruit size | Shown, typed in by hand | Build: storage. The rover cannot measure fruit yet |

## Alerts

| Requirement | Sample | Real version needs |
|---|---|---|
| Saturation above 85 %, bloom floor 55 %, salinity, root heat, sun-scald, fungal, pH | Shown | Port the rules in `mock/guava.ts`; their tests in `guava.test.ts` come along |
| Cracking: moisture jumps from below 35 % to above 80 % | Shown | Build: the engine reads only the newest value; it needs recent history |
| Stress at risk from humid air | Shown | Build with stress mode |
| Foliar spray window 18-25 °C | Listed in Targets, no alert | Build |
| Fuzzy-logic pump lockout in heat with wet soil | Not shown | Control path: decide after the watering rule |

## Water and feed

| Requirement | Sample | Real version needs |
|---|---|---|
| Water per tree by stage | Shown | The FAO planner allows exactly 4 stages; this needs 5, and % of ETc per stage |
| **Delivering it** | **Shown as a problem: a tree needs hours, firmware stops at 90 s** | **Decide: hardware or firmware change** |
| TAW and MAD from field capacity and wilting point | Not shown | Build: soil data per bed |
| Fertigation recipe per stage, 25/50/25 run | Shown | Build: data and screen move to the server |
| Tank clash: calcium nitrate apart from sulphates and phosphates | Shown, tested | Port the rule |
| Automatic dosing | Not shown | Hardware, later |

## Setups, money, disease

| Requirement | Sample | Real version needs |
|---|---|---|
| Setups A-D fill spacing, trees, yield, price | Shown | **`/crop-plan` refuses spacing above 400 cm, so 5 m fails today.** Metres in the form are shown; the API limit must go |
| Forecast per year, cost report per tree, labour share | Shown | Small changes to `cop_report` |
| Tree establishment cost spread over years | Flagged on the report | Build: treat it like equipment |
| Dried leaf sales | Not shown | Sales are per kg of crop; decide whether it matters |
| Five guava conditions against readings | Shown, by picking a symptom | Symptoms are tomato-only in `diagnosis.py`; make them per crop |
| Photo classification of these conditions | Same "model not installed" message as today | Needs a model trained for guava |

## Left out on purpose

Lab-level figures (AMF exudate chemistry, PCA of leaf norms), world leaf-export statistics, and root pruning, which the document itself
advises against. Soil N, P and K are shown but not rated, because the document gives removal per tonne of fruit, not soil targets.

## To settle with the owner

These show on screen too, in the cycle page's **Open questions** tab.

1. **Stress length.** Stage 1 is 45 days; the stress protocol says 60-90. The app uses 45.
2. **Bloom timing.** "Days 65-79 post-flush" lands around cycle day 111-125 (Stage 4), but flowering is Stage 3 (days 76-105). The app uses Stage 3.
3. **Yield tables.** Setup A: trees x yield gives 7-19 t/ha (document: 12-20). Setup C: 25-44 t/ha (document: 25-38), and 3 x 2 m is 1,667 trees/ha, not 2,000. B and D check out; 
4. **Year or cycle.** Yields are per year and a cycle is 180 days. The app assumes one bearing cycle a year.
5. **Price.** 5,500 riel is $1.38 at 4,000 riel to the dollar, not $1.25.
6. **Moisture scale.** 55-75 % is above what most mineral soils hold by volume. It fits a relative probe reading. Calibrate first.
7. **No sources** in the pasted text.
8. **Chemical doses** (NAA, 2,4-D, GA3, ethephon, urea defoliation, foliar mixes) are marked "confirm with an agronomist", and the growth regulators the document lists for deblossoming are not given as doses at all.
9. **Stage 1 without stress.** The document gives no moisture target for bending, pruning or chemical methods; the app uses the general 55-75 %.
10. **Soil N, P, K.** No soil targets in the document (above).

Choices made here, also yours to change: EC below 0.8 is a warning although the document lists it under critical; the EC ceiling is 3.0 where the document says 2.78-3.0; humid air during stress is a warning rather than critical, because there is no fruit to rot yet.
