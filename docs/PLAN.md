# AgriRover: plan (Musk 5-step)

Working plan for the team. Order matters: do not start step N+1 before step N is done.

**Changed 2026-11-05 by Daivai:** the rover is the main product, and guava is the one crop. The earlier plan put the rover in a later stage and sold the daily decision on fixed sensors. Its review is kept in `agrirover-business-review.md`; its warnings below still apply.

## What we sell
A rover that visits every guava tree every day, reads the soil and air, photographs the tree, and tells the farmer what to do today: how much water for each tree, whether to feed, which trees to go and look at.

**The promise:** less water, feed that cannot burn the trees or leave them short, better fruit grade, and fewer hours walking rows. None of it is measured in a field yet.

## What is different about a rover
A fixed probe reads one spot, all day. The rover reads every tree, once a day. So the value we must prove is **tree-by-tree differences**: if the trees in a block all need the same thing, a cheap fixed probe wins, and the rover has to justify its cost another way.

## Rules
1. Every requirement has a named owner (a farmer or us). No owner in 2 weeks: delete it.
2. Delete first. Add back ~10%. If nothing comes back, delete more.
3. Simplify only what survived.
4. Weekly cycles.
5. Automate last.

## Step 1: requirements and owners

| Requirement | Who asked | Verdict |
|---|---|---|
| Rover visits every guava tree daily | Daivai | **Keep. The product** |
| Reads soil and air at each tree | Daivai | Keep. Needs a probe arm |
| Analyses growth over time | Daivai | Keep. Leaf cover first; fruit count later |
| Tells the farmer what to do | Daivai | Keep. Built on simulated rounds |
| Water by stage and environment, as little as possible | Daivai | Keep. Built |
| Fertiliser: not too much, not too little | Daivai | Keep. EC guard and leaf test. **Not from the probe's N, P, K** |
| Learn from China's practice | Daivai | Done: [GUAVA-RESEARCH.md](GUAVA-RESEARCH.md) |
| GNSS and LiDAR to steer under canopy | Needed for guava | Keep. To build |
| Side camera on a mast | Needed for guava | Keep. To build |
| Tomato | Earlier work | **Deleted 2026-11-05** |
| Watering or spraying from the rover | First feature list | Delete |
| Thermal camera | PDF memo | Delete |

## Step 2: delete
Tomato: its guide, stages, setups, plan page and demo beds. Sample-data mode: guava runs on the real server now. The photo-based soil dryness: the probe measures moisture. The top-down bed camera and the grid of small cells.

## Step 3: simplify
One crop, one round a day, one list of what to do.

## Step 4: accelerate (weekly cycles)
1. **Prove the probe first, on a table:** a bought 7-in-1 probe, its datasheet, its firmware reader. Compare moisture with soil dried and weighed, and EC with a lab. No rover needed.
2. **Hand-carried round:** walk the probe from tree to tree on one block for two weeks, and type readings in. If trees do not differ, stop and rethink before building a rover to carry it. This is the cheapest test of the whole product.
3. **Week-0 baseline:** how watering and feeding are decided now, minutes spent checking, water and fertiliser used, last season's grade.
4. **Chassis and navigation:** drive one row between trunks, then one block.
5. **Split the block:** half advised by the round, half as usual, for a whole cycle. Measure water, fertiliser, minutes, yield and grade.
6. **10 grower interviews** around Siem Reap: what they pay per hectare, and would they pay for this.

## Step 5: automate last
Message, farmer acts. Then scheduled rounds with someone nearby. Then auto-valve once trusted. A scheduled round with nobody there comes last, after obstacle sensing.

## What the research changed
- Cheap N, P, K probes cannot set a dose (R² about 0 to 0.54 against a lab), so doses come from the stage plan, EC holds them back, and a leaf test corrects them.
- GNSS degrades under canopy. China's orchard robots combine it with LiDAR and an IMU.
- Water deficit at bloom and fruit growth costs fruit. A deficit at ripening raises sugar but cut yield in the one study that split it by stage. Test 75 % ETc with mulch during fruit growth on one block.
- China's quoted savings (30-70 % water) are for whole systems and mostly not from controlled trials. **Do not repeat them as ours.**

## Risks to keep in view
| Risk | Why it matters | What would settle it |
|---|---|---|
| Rover cost against a fixed probe per block | A few probes are far cheaper. The rover must earn its cost | Hand-carried round: do trees differ? |
| Pushing a probe into hard soil, at every tree, every day | Hard mechanics; roots; dry-season soil; wear | Arm prototype on your soil |
| Moving through tree rows | Low branches, ruts, hoses, mud in the rains | Row test before building the rest |
| Battery and time | About 2 hours for 100 trees at the estimated stop time | Timed row test |
| Unattended safety | No obstacle sensor or physical e-stop yet | Fit them before any field run |

## Claims we do not repeat (from the PDF memo)
- "12 MB EfficientNet-B4 + ViT": B4 alone is ~19M parameters.
- Thermal CWSI is weak in humid climates; Lepton 3.5 is rated +/-5 C typical; core alone is ~US$164.
- "84 h early", "R2 0.94": single-study numbers, not ours.

## Next in the repo
- [ ] 7-in-1 probe firmware reader (needs the probe's datasheet)
- [ ] Rover parts list for guava ([rover design](architecture/rover.md))
- [ ] Hand-carried round: a screen to type a tree's readings
- [ ] Telegram daily message from the advisor (it still uses the older rule engine)
- [ ] Record feed runs given, so "next feed" follows what really happened
- [ ] Week-0 baseline sheet and grower interview script
