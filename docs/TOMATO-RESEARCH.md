# Tomato: what it needs, and where each number comes from

The plan page turns one number (how many plants) and one date into water, feeding, jobs and a harvest window.
This file says what each part rests on, how much of each source was actually read, and what is only an assumption.
Code: `apps/api/app/services/crop_guide.py` (the guide), `climate.py` (weather), `water_plan.py` (the arithmetic).

## How the water is worked out

```
ETc (mm/day)      = Kc(crop day) x ET0(month)          FAO-56, single crop coefficient
litres per plant  = ETc x area per plant (m2) / efficiency
1 mm of water over 1 m2 = 1 litre. Rain is not subtracted.
```

* **Kc and stage lengths** (tomato: 0.60 / 1.15 / 0.80; 30, 40, 40, 25 days = 135): FAO-56 tables, as recorded in the crop's source line.
* **ET0 by month for Siem Reap** (mm/day): Jan 4.47, Feb 5.12, Mar 5.34, Apr 5.44, May 4.85, Jun 4.56, Jul 4.07, Aug 4.16,
  Sep 3.70, Oct 3.65, Nov 3.83, Dec 4.18 (average 4.45). Made from NASA POWER daily weather for 13.36 N, 103.86 E,
  2015-2024 (3,653 days), with the FAO-56 Penman-Monteith equation. The implementation reproduces FAO-56's own worked
  Example 18 (Ra 41.09, Rn 13.28, ET0 3.88 mm/day), which is a test (`tests/test_climate.py`).
  The old single value of 4.5 was an unsourced guess. It happened to match the yearly average, but the months differ by
  1.8 mm/day, which is why a November crop needs less water than a March crop. Run `python -m app.services.climate` to refresh the table.
* **Efficiency** 0.9 drip, 0.75 sprinkler, 0.6 hand watering: typical textbook values, not measured on this farm.

## Cross-check against Japanese growers

Aomori's best growers applied 2.2-3.0 litres per plant on their busiest day, at 2.04 plants per m2 (0.49 m2 each).
That is 4.5-6.1 mm a day. The plan's busiest day is 4.25 mm (planted early July) to 6.26 mm (planted early January).
Over all 365 possible planting dates it is inside the Japanese range on 222 and within 10% of it on the other 143; never further out.
The two agree on size. This supports the order of magnitude only: Aomori is a greenhouse in a cool climate, one skilled grower, and the fit
between water and sunshine is loose (R2 = 0.51).

## Sources

| Source | How much was read | What it supports |
|---|---|---|
| Aomori Agriculture and Forestry Research Institute, FY2024: irrigation volume and solar radiation, summer-autumn tomato. https://www.pref.aomori.lg.jp/soshiki/nourin/nosui/files/R6-ys3.pdf | In full (text extracted from the PDF) | 1.2 / 1.8 / 2.4 L per plant at 10 / 20 / 30 MJ/m2; peak 2.2-3.0 L; daily maximum pF 1.8-2.0; irrigation from the day after planting; 204 plants per are; yield 15-18 t/10a against a regional 11; first picking 49-53 days and topping 135-144 days after planting |
| Fukushima Agricultural Experiment Station: soil-moisture controlled irrigation of summer-autumn tomato (1996-98) and pF-sensor fertigation (2004). https://www.pref.fukushima.lg.jp/uploaded/attachment/447910.pdf | In full (two short summaries) | pF 2.2-2.4 until the third flower truss, 2.0 after; sensor at 10 cm; irrigation at 06:00 and 07:00 |
| Hiroshima Agricultural Research Center, 2001: fertigation guide. https://www.pref.hiroshima.lg.jp/uploaded/attachment/545012.pdf | **Partly.** The PDF's Japanese font would not decode | Peak 3.4 L per plant; cloudy day two-thirds, rainy day one-third to none. These come from a search-engine quotation and match the numbers visible in the garbled text. Treat as less certain |
| Kumamoto Prefecture, Agri-Kumamoto: irrigation of summer-autumn tomato and pepper. https://agri-kumamoto.jp/ | In full (one page) | Water early in the morning, not midday, not in the evening unless the soil is very dry |
| Yamaguchi Prefecture, 2020: automatic irrigation for high-sugar tomato. https://www.pref.yamaguchi.lg.jp/uploaded/attachment/61636.pdf | In full (two pages) | A dry bed edge raises blossom-end rot |
| Ro S. et al. (2021), Royal University of Agriculture, Cambodia. Plants 10(3):449, doi:10.3390/plants10030449 (CC BY) | Abstract, methods, results text | 50 x 70 cm spacing; CARDI fertiliser rate N : P2O5 : K2O = 75 : 30 : 100 kg/ha plus 20 t/ha compost, half the nitrogen at planting, a quarter at first flowers, a quarter after first harvest; rice straw mulch 10 t/ha; March-June trial air 23.5-38.8 C; fruit setting fell in heat; local KK1 and Neang Tamm held up best |
| NASA POWER; FAO-56 (Allen et al. 1998) | Downloaded and computed here; method and tables | Monthly ET0, average daily highs, rain; Kc and stage lengths |

Looked at but **not used**: a Miyagi fertigation document (404), an Akita nitrogen-uptake figure (garbled text), and the
abstract-only listing of Alvar-Beltran et al. 2022 (crop model for tomato in Siem Reap under future climate). None of these
numbers are on screen.

## Where the guide goes beyond the sources (marked "Standard practice" on screen)

* Staking and removing side shoots weekly; stop watering when picking stops.
* The day windows for the second and third feed (days 28-42 and 49-63) and the first-flower timing are approximate.
* The heat warning: more than a quarter of the cycle in March-June is flagged "warn", less is a "note". The March-June
  window is the Cambodian trial's; the quarter threshold is ours.
* Fertiliser products: urea 46% N, triple superphosphate 46% P2O5, potash 60% K2O are standard grades.

## Stage targets, alerts and yield benchmarks (the farm's own table)

Added 2026-11-04. These numbers are **the owner's agronomy table**, not figures checked against a study here, and the screen says so ("basis: spec").
Code: `services/agronomy.py` (targets, alerts), `setups.py` (yield), `diagnosis.py` (symptom cross-check).

| Stage (days) | Target moisture | Target EC (mS/cm) | Focus |
|---|---|---|---|
| Seedling and transplant (1-25) | 65-75 % | 1.2-1.8 | Root establishment. Moderate N, high P |
| Vegetative growth (26-45) | 60-75 % | 1.8-2.4 | Canopy growth. High N |
| Flowering and fruit set (46-70) | 65-80 % (never below 55) | 2.2-3.0 | Heat sterilizes pollen |
| Fruit bulking and ripening (71-110) | 50-65 % | 2.5-3.5 | Drier soil prevents cracking and raises Brix. High K |

Past day 110 the last stage carries on (the screen says "past the table"); tomatoes are picked until about day 135.
Not stage-dependent: soil pH 6.0-6.8, soil temperature 18-26 C, air 21-29 C, humidity 60-75 %, N 100-150, P 60-100, K 150-250 mg/kg.
With no crop planted, moisture 50-80 % and EC 1.5-3.5 apply.

A reading is **warning** outside its range and **critical** past a hard limit (strictly beyond, as written: exactly 32.0 C is not past 32):
soil temperature above 30 C, air above 32 C, humidity above 85 %, EC above 4.0, pH below 5.8, moisture below 45 %.
Alerts (all critical; only while a crop is in the ground and the reading is under 30 minutes old):

| Alert | When |
|---|---|
| Pollen sterility | From day 46: air above 32 C by day (06:00-18:00 farm time) or above 26 C at night |
| Calcium lockup, blossom end rot risk | Soil moisture below 45 % or soil pH below 5.8 |
| Fungal and blight window | Humidity above 85 % and air above 22 C |
| Salinity and fertilizer burn | Soil EC above 4.0 |
| Root heat stress | Soil temperature above 30 C |
| Flowering moisture floor | Days 46-70: soil moisture below 55 % ("never let moisture drop below 55 %" in the table) |

Growing setups, each for a 50 m2 bed (the arithmetic is a test: 100 x 2.5 = 250 and 125 x 4.0 = 500, and so on for all three):

| Setup | Plants per m2 | Plants | kg per plant | Harvest |
|---|---|---|---|---|
| Standard open field | 2.0-2.5 | 100-125 | 2.5-4.0 | 250-500 kg |
| Intensive raised bed | 2.5-3.0 | 125-150 | 4.0-5.0 | 500-750 kg |
| Net-house or greenhouse | 3.0-3.5 | 150-175 | 6.0-8.0 | 900-1,400 kg |

The net-house yield sits inside the 5.4-8.8 kg per plant of the Aomori greenhouse growers above. Nothing read so far gives an open-field
yield for Cambodia, so the other two rows rest on the table alone.

Symptom cross-check, in the table's words: blossom end rot with moisture below 50 % or pH below 5.8 (calcium locked by a dry or acidic root zone);
early blight with humidity above 80 %; leaf curling with air above 32 C or a dry root zone; interveinal chlorosis with pH above 7.2 or high EC.

### Where I went beyond the table (marked "practice" on screen)

* The row and plant spacing that picking a setup fills in (100 x 45, 90 x 40, 80 x 40 cm): the nearest round spacing inside each density range.
* Day and night for pollen: 06:00 to 18:00 farm time is day.
* "High EC" and "moisture deficit" had no number: they are the stage's own EC ceiling and moisture floor (3.5 and 50 with no stage).
* Leaf curling counts soil above 30 C (the Root heat stress line) as heat, not only 32 C, so the photo check and the alert agree.
* When only the second cause is met (a dry root zone behind leaf curl, salt behind chlorosis), the sentence says that instead of repeating the first.
* The flowering moisture floor is an alert of its own; the table states the rule but lists no alert for it.
* A leaf-curl label from a model that mentions a virus (Tomato Yellow Leaf Curl Virus, whitefly-borne) is never matched to the heat rule, and leaf curling always carries a note that a virus looks the same.

### Open questions (found while building it, not settled)

1. **The watering rule and the stage targets are different numbers.** Each bed's irrigation rule waters below 30 % moisture (a placeholder, see `seed.py`); the stage table wants 65-75 % in the seedling stage. Today's card shows both ("waters below 30 %; the target for this stage is 65-80 %"). This app does not override the rule engine (see `UX-DECISIONS.md`), so nothing was wired together. Decide after the probe is calibrated.
2. **Moisture of 65-80 % is above the volumetric water content most mineral soils can hold** (they are saturated at roughly 40-55 % by volume; general soil physics, not a source read for this project). The table fits the relative "moisture %" that cheap RS485 probes report, or a peat or coco substrate. Calibrate the probe (`sensor.calibration_dry` / `calibration_wet`) before trusting any moisture alert.
3. **EC** from these probes is the bulk soil EC, which changes with moisture, not the saturated-paste EC that targets such as 2.5-3.5 usually mean. Probes usually report uS/cm; the ingest converts, the firmware must send the unit.
4. **The stage windows are not the FAO-56 water stages** (1-30, 31-70, 71-110, 111-135) that the water plan uses. Both are on screen, with different names, because they answer different questions.
5. **Blossom end rot is checked at 45 % by the alert and 50 % by the photo check**, as written in the table.
6. **The 7-in-1 probe firmware is not written.** Register maps differ between vendors; send the datasheet. `edge/field-node-sim` publishes the exact payload meanwhile (`SIM_PROBE=7in1`).

## What it cannot say

* Japanese yields (5.4-8.8 kg per plant) are greenhouse yields in a cool climate. An open field in Cambodia will give
  less. The screen shows them as a ceiling to aim at, and the app records the farmer's own harvest to give the real cost per kg.
* ET0 is an average year. A hot dry spell needs more water; the soil sensor decides on the day.
* Only tomato has a guide. Other crops get the water plan (their own Kc) but no feeding, jobs or harvest notes, and say so.
