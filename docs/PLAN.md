# AgriRover: plan (Musk 5-step)

Working plan for the team. Order matters: do not start step N+1 before step N is done.

**Changed 2026-11-06 by Daivai:** the rover focuses on checking nutrients, following the concept of Picketa's LENS (collect a leaf, scan it, act). Guava stays the one crop. As a nutrient checker the system scores 21 / 100 against LENS today: lab results can be recorded and rated, but there is no leaf sensor and no real result yet ([the comparison](PICKETA-RESEARCH.md#compared-with-lens)). **Nothing on the rover checks a nutrient.**

**Changed 2026-11-05 by Daivai:** the rover is the main product, and guava is the one crop. The earlier plan put the rover in a later stage and sold the daily decision on fixed sensors. Its review is kept in `agrirover-business-review.md`; its warnings below still apply.

## What we sell
A rover that checks guava leaf nutrients, block by block, and tells the farmer what to do. **Collect → Scan → Act:** collect leaves the standard way, scan them, say which block is short of what and the one thing to do.

**The promise:** feed that follows what the leaf shows, not only the calendar, and an answer in the field, without waiting for a lab. None of it is measured in a field yet.

## What the rover adds
A lab takes days. A person with a scanner reads what they carry to it. The value the rover must prove:

1. **Blocks or trees differ in what the leaves show.** If they all read the same, a lab test per cycle wins, and the rover has to justify its cost another way.
2. **It is cheaper than a person with a hand scanner.** While a person picks the leaves, it may not be. See Risks.

Nutrient readings do not need every tree every day. Guava leaf standards use a composite from many leaves at a set stage, and LENS samples per area ([research](GUAVA-RESEARCH.md#leaf-nutrient-check-6-nov-2026)). So the nutrient round is **per block, per stage**. A per-tree scan is something to test, not assume.

## Rules
1. Every requirement has a named owner (a farmer or us). No owner in 2 weeks: delete it.
2. Delete first. Add back ~10%. If nothing comes back, delete more.
3. Simplify only what survived.
4. Weekly cycles.
5. Automate last.

## Step 1: requirements and owners

| Requirement | Who asked | Verdict |
|---|---|---|
| **Rover checks leaf nutrients: collect, scan, act** | Daivai, 6 Nov | **Keep. The product.** Not built |
| Record leaf samples and lab results, rated low / OK / high | Daivai, 6 Nov | Keep. **Built:** Plant health, Leaf tests. No real result yet; advice does not read them |
| From a scanner, start with N, P, K, Mg as low / OK / high; add a nutrient when its paired tests pass | Follows from the research | Keep. Not built |
| Every scan paired with a lab result until the model passes | LENS method | Keep. Not built |
| Learn from Picketa's concept, on guava only | Daivai, 6 Nov | Done: [PICKETA-RESEARCH.md](PICKETA-RESEARCH.md) |
| Tells the farmer what to do | Daivai | Keep. Built on simulated rounds; must take leaf results as input |
| Fertiliser: not too much, not too little | Daivai | Keep. EC guard is built; the leaf check is what is missing. **Not from the probe's N, P, K** |
| Rover visits every guava tree daily | Daivai, 5 Nov | **Changed.** Daily round stays as built for soil and yellow flags, no new work. Not used for nutrients |
| Reads soil and air at each tree | Daivai | Keep as the "why" behind a leaf result (EC, pH lock-up). Its arm moves behind the leaf work |
| Analyses growth over time | Daivai | Keep as built. Leaf cover first; fruit count later |
| Water by stage and environment, as little as possible | Daivai | Keep as built. No new work planned |
| Photo check | Daivai | Keep as built. A screen only: it never reports a nutrient value |
| Learn from China's practice | Daivai | Done: [GUAVA-RESEARCH.md](GUAVA-RESEARCH.md) |
| GNSS and LiDAR to steer under canopy | Needed for guava | Keep. To build |
| Side camera on a mast | Needed for guava | Keep. To build |
| Tomato | Earlier work | **Deleted 2026-11-05** |
| Watering or spraying from the rover | First feature list | Delete |
| Thermal camera | PDF memo | Delete |

## Step 2: delete
**6 Nov:** soil N, P and K from the promise. They stay in the data for now, and come off the screens with the next code work.

**5 Nov:** Tomato: its guide, stages, setups, plan page and demo beds. Sample-data mode: guava runs on the real server now. The photo-based soil dryness: the probe measures moisture. The top-down bed camera and the grid of small cells.

## Step 3: simplify
One crop, one nutrient round per stage, one list of what to do.

## Step 4: accelerate (weekly cycles)
1. **Lab baseline: the cheapest test of the whole product.** Pick leaves the standard way ([ROVER-SOP.md](ROVER-SOP.md#leaf-sample-how-to)), send them to a lab, enter the results under Plant health, Leaf tests. Blocks compared shows them side by side. Do blocks or trees really differ? If not, stop and rethink before building anything to scan them. First find a lab that tests leaf tissue: none was found yet.
2. **Scanner on a table.** Test candidate scanners against paired lab results, starting near 100 pairs. Proposed pass mark: at most 10 % of samples off by more than 20 %, on samples the model did not train on. That number is ours, for Daivai to change. Options: [research](GUAVA-RESEARCH.md#leaf-nutrient-check-6-nov-2026).
3. **Week-0 baseline:** how watering and feeding are decided now, minutes spent checking, water and fertiliser used, last season's grade.
4. **Chassis and navigation:** drive one row between trunks, then one block.
5. **Rover carries the scanner.** A person picks the leaf at each stop. Time it against a person with the scanner alone.
6. **Soil probe:** a bought 7-in-1 probe, its datasheet, its firmware reader. Compare moisture with soil dried and weighed, and EC with a lab. Then carry it by hand to the same trees as the leaf samples, to see whether it explains them.
7. **Split the block:** half advised by the nutrient round, half as usual, for a whole cycle. Measure fertiliser, minutes, yield and grade.
8. **10 grower interviews** around Siem Reap: what they pay per hectare, and would they pay for this.

## Step 5: automate last
Message, farmer acts. Then an arm that scans leaves, only after step 4.5 works: the closest work reached 70 % end to end on pistachio, with a 6-axis arm, in a preprint. Then a soil probe arm. Then scheduled rounds with someone nearby. Then auto-valve once trusted. A scheduled round with nobody there comes last, after obstacle sensing.

## What the research changed
- **No guava-leaf scanner calibration was found.** We must build our own against a lab.
- **Low-cost scanners are weak beyond N.** On oil palm, 2 % of N samples were off by more than 20 %, against 30 % for K and 60 % for Mg. Micronutrients stay out for now. Aluminium has no guava range.
- **Guava leaf ranges disagree** between studies of the same cultivar (P 1.5-1.7 against 1.0-1.3 g/kg; B 26-38 against 13.1-19 mg/kg). They are a starting reference until we have our own.
- Cheap N, P, K probes cannot set a dose (R² about 0 to 0.54 against a lab), so doses come from the stage plan, EC holds them back, and a leaf test corrects them.
- GNSS degrades under canopy. China's orchard robots combine it with LiDAR and an IMU.
- Water deficit at bloom and fruit growth costs fruit. A deficit at ripening raises sugar but cut yield in the one study that split it by stage. Test 75 % ETc with mulch during fruit growth on one block.
- China's quoted savings (30-70 % water) are for whole systems and mostly not from controlled trials. **Do not repeat them as ours.**

## Risks to keep in view
| Risk | Why it matters | What would settle it |
|---|---|---|
| Rover against a person with a hand scanner | While a person picks the leaves, the rover may add little. It must earn its cost | Timed comparison at step 4.5 |
| Leaves do not differ enough to matter | Then a lab test per cycle wins | Lab baseline, step 4.1 |
| A scanner cannot read guava well enough | K and Mg were weak on oil palm; nothing is known for guava | Paired test, step 4.2 |
| Calibration may not carry over | The farm has Local Khmer and Kimju trees, and LENS read far from the lab on corn in one independent test | Paired samples per variety and per stage |
| No lab found | Without one there is nothing to pair against | Find one, with its price and time |
| Rover cost against a fixed probe per block | A few probes are far cheaper for soil | Soil probe round, step 4.6 |
| Pushing a probe into hard soil, at every tree | Hard mechanics; roots; dry-season soil; wear | Arm prototype on your soil. Moved behind the leaf work |
| Moving through tree rows | Low branches, ruts, hoses, mud in the rains | Row test before building the rest |
| Battery and time | About 2 hours for 100 trees at the estimated stop time; a leaf stop is not timed | Timed row test |
| Unattended safety | No obstacle sensor or physical e-stop yet | Fit them before any field run |

## Claims we do not repeat
**LENS's own figures:** up to 20 % less fertiliser and within 2-3 % of the lab are the company's, and for potato. Never quote them for guava or as ours.

**From the PDF memo:**
- "12 MB EfficientNet-B4 + ViT": B4 alone is ~19M parameters.
- Thermal CWSI is weak in humid climates; Lepton 3.5 is rated +/-5 C typical; core alone is ~US$164.
- "84 h early", "R2 0.94": single-study numbers, not ours.

## Next in the repo
Nutrient check, in order:
- [x] Tables and a screen to enter a leaf sample and its lab result ([SCHEMA.md](SCHEMA.md#leaf-samples-and-results-migration-0010))
- [x] Move the "Send a leaf sample" task to day 86-94: in flowering, after the zinc and boron spray
- [x] Numeric ranges, with low / OK / high against them
- [x] Blocks compared: each block's newest result, side by side
- [ ] Export of leaf results, and history per block and per tree
- [ ] Advice that takes a leaf result as input
- [ ] Take soil N, P, K off the screens
- [ ] Reword Rover, What it does, and the rest of Rover, SOP: they still describe the old product
- [ ] Mark simulated rover averages in `sensor_reading`: they are stored as `valid` today (`services/rover_live.py`)

Still open from before:
- [ ] 7-in-1 probe firmware reader (needs the probe's datasheet). A real `rover run` passes no probe yet, so it would report no readings
- [ ] Rover parts list for guava ([rover design](architecture/rover.md))
- [ ] Telegram daily message from the advisor (it still uses the older rule engine)
- [ ] Record feed runs given, so "next feed" follows what really happened
- [ ] Week-0 baseline sheet and grower interview script
