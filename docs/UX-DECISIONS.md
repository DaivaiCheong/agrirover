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
