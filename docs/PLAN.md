# AgriRover: business-first plan (Musk 5-step)

Working plan for the team. Order matters: do not start step N+1 before step N is done.

## What we solve
Farmers find out too late that plants are thirsty or sick, and pay people to walk every row. The rover is one way to carry the camera. It is not the product. The product is a daily decision: where to water, where to check.

Cambodia context: rural labour shortage at peak season; hired spraying up to US$18-25/ha; cassava mosaic virus spread by infected stem cuttings; farmers pay ~US$10/ha for field services, and first-time drone services needed a 50% subsidy.

## Rules
1. Every requirement has a named owner (a farmer or us). No owner in 2 weeks: delete it.
2. Delete first. Add back ~10%. If nothing comes back, delete more.
3. Simplify only what survived.
4. Weekly cycles.
5. Automate last.

## Step 1: requirements and owners

| Requirement | Who asked | Verdict |
|---|---|---|
| Drive the field autonomously | Daivai, for CDA | Keep for the CDA demo only |
| When and how much to water | Daivai, guava block | Keep, test first |
| Spot sick plants early | No named farmer yet | Keep: name a grower, phone photo first |
| Thermal camera | PDF memo | Delete |
| NPK/pH probe | First feature list | Delete |
| Yield prediction | First feature list | Delete |
| Watering/spraying from the rover | First feature list | Delete |
| RTK GPS | PDF memo | Later |

## Step 2: delete
Rover out of the first product. All "Delete" rows. Renaming (keep the name AgriRover).

## Step 3: simplify
One crop, one decision, one daily message, e.g. "Zone B: water 20 min, Zone C: skip".
- Field node + soil probes at 2 depths, calibrated to site soil.
- Existing rule engine (`apps/api/app/services/rule_engine.py`).
- Disease: farmer sends a phone photo, MobileNetV2 model checks it.

## Step 4: accelerate (weekly cycles)
- Week 0: write down how watering is decided now, time spent checking, losses.
- Guava block: half sensor-guided, half usual. Compare after 4-6 weeks. The fish system's daily water exchange sets the volume, so measure even distribution and no waterlogging, not water saved.
- 10 farmer interviews around Siem Reap: last season's losses, what they pay per ha, would they pay X.

## Step 5: automate last
Message, farmer acts. Then auto-valve once trusted. Rover or drone scouting only when scouting labour is the measured bottleneck and farms pay.

## Two tracks
- CDA: rover stays as the research demo.
- Business: Stage 1 sells the decision. Rover + drone = Stage 2 scouting service.

## Claims we do not repeat (from the PDF memo)
- "12 MB EfficientNet-B4 + ViT": B4 alone is ~19M parameters.
- Thermal CWSI is weak in humid climates; Lepton 3.5 is rated +/-5 C typical; core alone is ~US$164.
- "84 h early", "R2 0.94": single-study numbers, not ours.

## Next in the repo
- [ ] Stage-1 sensing kit list (BOM)
- [ ] Rover v2 list: no thermal, no NPK, no RTK
- [ ] Week-0 baseline sheet
- [ ] Farmer interview script
