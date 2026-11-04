# Interface: Elon Musk's five steps, applied

The user is a farmer on a phone, outdoors, who does not know crop science. Their questions are four:
what do I do today, what should I plant and how much water does it need, where does my money go, and am I making money?

1. **Question the requirements.** Every screen had to answer one of the four questions. Breadcrumbs, a "kicker" line
   over every title, graph-paper styling and monospaced all-caps labels answered none of them.
2. **Delete.** The breadcrumb bar; the kicker line; all-caps mono labels and registration marks; the separate
   "Water planner" page (it is part of Plan a crop now); the "Start a cycle" form (Plan a crop starts it); the ET0 setting
   (it comes from the weather); the crop-factor form from the main path (tucked under "Grow something that is not in the list").
3. **Simplify.** Thirteen sidebar links became five places (Today, My crops, Money, Results, Farm) with tabs inside three of them.
   One green for "do this", one blue for water, status colours that mean the same everywhere. Sentence case, plain words
   ("Needs water", not "irrigate"). On a phone the five places are a bottom bar with icons.
4. **Accelerate.** One number starts a plan and it recalculates as you type. A crop with no plant count asks for it on Today.
   "Start this crop" creates the bed and the crop together; the area comes from the plant count. The planting date defaults
   to today where the farmer is (not UTC). Wide tables scroll inside their card instead of the page.
5. **Automate last.** Water by month from the weather, feeding amounts from the spacing, jobs from the crop day. Next candidates:
   Telegram entry of costs, and soil-sensor readings correcting the plan.

## Soil and air readings (the ribbon)

Question: what must a farmer see per bed? Seven readings (moisture, pH, EC, soil temperature, N-P-K, air temperature, humidity),
whether each is where this crop wants it today, and whether anything needs action. Nothing else.

* **Delete.** The big moisture number on Today (the ribbon has it), the "Soil moisture" and "Last reading" columns of the land table
  (the telemetry table has them), a separate alerts page (alerts sit on the bed they belong to), an alert table (see `SCHEMA.md`).
* **Simplify.** One component, two rows of cells, the same on a phone and on a desktop card. The value is the biggest thing in a cell;
  the unit and the target range sit beneath it in muted text, like a reference range on a lab result. Only readings out of range
  take a colour, so a healthy bed is quiet and an unhealthy one is obvious.
* **Status is never colour alone.** A bar, a glyph (triangle = warning, circle = critical, clock = old reading), an arrow for
  low or high, and the words in the badge and in the tooltip and screen-reader text. The badge says "Normal", "Warning" or "Critical".
* **Both thresholds stay visible.** Each bed's watering rule waters below 30 %; the stage wants 65-80 %. They are different numbers,
  and the card says both rather than hiding one. The app does not override the rule engine (above), so aligning them is the owner's call.
* **History.** Nine small charts, one per reading, one shared time window chosen once above them. Each has the same numbers as a table,
  the target band shaded, and a gap (not a straight line) wherever a sensor was silent for a while.
* **Accelerate.** Picking a growing setup fills the spacing and, for a bed of known size, the plant count, and shows the harvest and
  revenue before the crop is saved. A symptom can be checked against the sensors without a photo, because the disease model is not installed yet.

Checked in a real browser against a throwaway database (headless Chrome over the DevTools protocol): the ribbon at card width and on a
phone, the alert rows, hover and the table twin of the charts, the setup form with a density outside the range, the symptom cross-check,
the cost report's forecast, and no sideways scrolling at 390 px on 14 pages. That check found three bugs a type check cannot:
screen-reader text positioned outside a scrolling table widened the whole page on a phone; one empty bucket made every chart line look
dashed; and the Status column was scrolled out of sight.

## Review round

A written review of the first version was checked against the code before anything changed.

**Adopted.** (1) In edit mode a row showed `Save · Cancel` and then ran straight into `Cost report` with no separator: a real bug.
While editing, only Save and Cancel are shown now. (2) "Close" ends a crop, so it is "End crop", in red, with a confirmation.
(3) Two places to add a crop became one: "A crop that is not in the list" is an option inside Plan a crop.
(4) The area is no longer hidden: typing the plant count suggests the bed area (0.35 m² a plant, from the Cambodian trial)
on Today and in My crops, and the farmer can overwrite it. (5) The day carries its stage: "Day 22 · Settling in".
(6) A crop card shows its bed's soil sensor, and the guided bed also shows the rule engine's advice. (7) The product name is one
constant (`lib/brand.ts`), so a rename is a one-line change.

**Not adopted, and why.**
* "Water depends on area, not plants." It does, and the planner already works per square metre (1 mm = 1 L per m²) and scales by
  the ground each plant gets. What was missing was showing and editing that area, which (4) fixes.
* 0.4 m² a plant and "Early flowering at day 22". Neither has a source. The Cambodian trial used 0.35 m², and by the FAO stages
  day 22 is still "Settling in" (days 1-30); first flowers come about day 28-42.
* Soil thresholds of 60% depletion or -20 to -35 kPa. The Japanese target is pF 1.8-2.4, which is about 6-25 kPa (moister),
  and the irrigation thresholds belong to the rule engine, which this app does not override.
* Savings claims (25-38% water, $25 an acre). Nothing here measures them yet; the Compare page says it does not prove why two
  beds differ.
* Renaming the product. Searches found nothing called MarginRoot, CanopyZero or XylemIQ, which is not the same as cleared.
  XylemIQ sits next to Xylem Inc., a large water-technology company. A trademark and domain check comes first, and the name is the owner's call.

Checked in a real browser (DevTools protocol, throwaway database): typing plants, changing watering method, starting a crop
for a future and a present date, adding a cost, saving the riel rate, the chart drawing, no console errors, and no sideways
scrolling at 390 px on six pages.
