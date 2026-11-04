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

Checked in a real browser (DevTools protocol, throwaway database): typing plants, changing watering method, starting a crop
for a future and a present date, adding a cost, saving the riel rate, the chart drawing, no console errors, and no sideways
scrolling at 390 px on six pages.
