# Picketa Systems (LENS): what they do, what is proven, how AgriRover compares (6 Nov 2026)

**Decision, 6 Nov 2026 (Daivai):** the rover follows the LENS concept and focuses on checking nutrients. We copy the concept, not their crops: guava only for now. What this changes is in [PLAN.md](PLAN.md).

**How this was read.** The [LENS page](https://www.picketa.com/solutions/the-lens) was opened on 6 Nov 2026, and its nutrient tiles were seen in a screenshot from Daivai. Other sources are search summaries of the pages linked. "Company" marks a claim from Picketa or a press release, not a test.

## The business in one line
A grower waits 4-10 days for a leaf-tissue lab result, so feed decisions come too late. LENS scans leaves in the field and returns 13 nutrients in minutes. ([Huddle](https://huddle.today/2022/05/04/meet-the-company-uprooting-atlantic-canadas-potato-industry/), [CropLife](https://www.croplife.com/precision-tech/crop-nutrient-management-how-the-picketa-lens-tool-is-providing-real-time-plant-tissue-analysis/))

| | Picketa |
|---|---|
| Problem | Lab tissue tests take days; fertiliser on PEI rose 75-100 % in a year ([PotatoPro](https://www.potatopro.com/node/133030)) |
| How | 10-15 healthy leaves per area, each scanned by an optical probe; reflectance across a wide spectrum goes to cloud machine-learning models (chemometrics) ([CropLife](https://www.croplife.com/precision-tech/crop-nutrient-management-how-the-picketa-lens-tool-is-providing-real-time-plant-tissue-analysis/)) |
| Process they sell | 1 Collect leaves · 2 Scan with LENS · 3 Take action (picketa.com) |
| Time | "Just a few minutes", results in about two minutes. **Company** (LENS page) |
| Results | Fieldbook dashboard, shared with growers, clients or team members (LENS page) |
| Nutrients | "13 key macro and micronutrients" (LENS page). Tiles seen: N, S, P, K, Mg, Ca, Mn, B, Zn, Cu, Fe, Al. That is 12; the 13th was not seen |
| Who pays | Agronomists and ag retailers, not single farms: 45 retailers in North America ([PotatoPro 2026](https://www.potatopro.com/node/173342)) |
| Price | US$10,000 a year: hardware, unlimited sampling, support and Fieldbook software (same). Not on the LENS page |
| Crops | Potato, corn, canola, soy, wheat, "more coming" (LENS page). Guava is not listed |
| Money raised | ~C$300k 2022 to validate the method and get one season of case studies; C$1.4M seed 2023; C$2.1M 2026 ([PotatoPro](https://www.potatopro.com/node/133030), [PotatoPro 2023](https://www.potatopro.com/es/news/2023/picketa-systems-deploys-new-lens™-tissue-analysis-system-usd-14m-seed-round), [AgFunder](https://agfundernews.com/picketa-raises-1-5m-to-bring-crop-nutrient-testing-to-the-field)) |
| Value claim | Up to 20 % less in-season fertiliser. **Company** |

**Not stated on the LENS page:** which leaves to pick, sufficiency ranges, recommendations, accuracy figures, calibration detail, price.

## What is proven, and what is not
| Claim | Evidence | Status |
|---|---|---|
| N, P, K within 2-3 % of the lab on potato, micronutrients 6-8 % | Three years of potato trials ([Producer](https://www.producer.com/?p=284806)) | **Company**, trade press |
| Works on corn | Independent preprint, Nebraska, 4 N rates × 4 reps: LENS read N at 4.4-4.6 % where the lab read 2.9-3.2 %, and found no treatment effect; P, K, Ca also read high (K ~40 %) ([Research Square, Dec 2025](https://sciety.org/articles/activity/10.21203/rs.3.rs-8371845/v1)) | **Not shown** for that crop and model year. Abstract only seen |
| Calibration | Each new crop: paired samples, one scanned, one to a certified lab; university partners Guelph, Missouri, Nebraska, Cornell ([CropLife](https://www.croplife.com/precision-tech/crop-nutrient-management-how-the-picketa-lens-tool-is-providing-real-time-plant-tissue-analysis/)) | Method stated |
| Independent check under way | Olds College paired device and lab results across crops; Picketa funds it ([Olds College](https://www.oldscollege.ca/smart-farm-research/research-projects/smart-ag/current/in-field-nutrient-analysis.html)) | In progress, not independent of funding |

**Lesson:** even a funded, university-backed sensor failed an independent test on a crop in its range. A model is only as good as the crop and site it was calibrated on.

## AgriRover's features today (6 Nov 2026)
Scores are our judgement, out of 10. Finance and stock are outside this check.

| Feature | State | Score |
|---|---|---|
| Rover round software (route, safety stops, reports) | Runs on the live demo, simulated field | 7 |
| Today, Health, 3D farm, Rover screens | Work | 7 |
| Water per tree | Real rules, simulated readings | 6 |
| Feed advice | Calendar dose from the guava document (unchecked); EC can only hold it back (`services/advisor.py`) | 5 |
| Photo check | Real model, real photos; names right "about 4 in 10" | 4 |
| Soil N, P, K | Simulated, shown as a trend, never used for a dose | 2 |
| Leaf ranges | 11 nutrients as display text; nothing compares against them (`services/guava.py`, `LEAF_RANGES`) | 2 |
| Rover camera analysis | Counts yellow pixels; tested on simulated images only | 2 |
| Per-tree history | Data is stored; no screen or API | 2 |
| Rover hardware | Motor firmware only. No chassis, arm, navigation or probe reader. A real `rover run` passes no probe (`rover/__main__.py`), so it would report no readings | 1 |
| Leaf test | Only a task, "Send a leaf sample to a lab". No way to enter a result | 1 |

## Compared with LENS
10 means as good as LENS on its own crops.

| LENS concept | LENS | AgriRover today | Score |
|---|---|---|---|
| Collect | Person picks 10-15 healthy leaves per area | Rover reaches trees in simulation, touches no leaf; no sampling instructions | 1 |
| Leaf sensor | Portable optical scanner | None | 0 |
| Leaf to nutrient values | Trained models | None | 0 |
| Nutrients covered | 13 claimed | 3 in soil, simulated; none in leaf | 1 |
| Time to result | About 2 minutes | No result in the app; lab time unknown | 0 |
| Compare with ranges | Not stated on the page | Text list, no comparison | 2 |
| Turn it into action | Results shared; the page describes no recommendation | One clear action per problem, but not from leaf data | 4 |
| Results screen and sharing | Fieldbook | Good screens, no nutrient view, no nutrient export | 3 |
| Lab pairing for each crop | Paired samples per crop (trade press) | None in the system; a manual SOP step only | 1 |
| Field evidence | Company potato trials; an independent corn preprint found no treatment effect | None, all simulated | 0 |

**Total: 12 / 100.** As a nutrient checker the system barely exists. The base around it is sound: screens, rover software and the Read → Find → Act shape.

**Where we are ahead (not scored, and none of it field-proven):**
- Built for guava, which LENS does not list.
- Can visit every tree, where LENS samples per area.
- Soil readings can explain why a leaf is low (EC, pH lock-up).
- Water advice and a photo check on the same screen.

## What AgriRover copies
1. **Collect → Scan → Act, on leaves.** This is the concept. On screen it stays **Read → Find → Act**: read the leaf, find the block with a shortage and its number against the range, say one thing to do. Nothing that does not lead to an action.
2. **Start from a measured problem.** Picketa began with growers who already paid for lab tests and waited days. Ours: send leaves to a lab first (`PLAN.md` step 4.1). Do blocks or trees really differ? Until that is measured, the rover's value is assumed.
3. **Paired samples before any claim.** Each scan is paired with a lab result from the same leaves. A nutrient appears on screen only after its paired tests pass ([GUAVA-RESEARCH.md](GUAVA-RESEARCH.md)).
4. **The leaf, not the cheap soil probe, sets the dose.** A low-cost N-P-K probe cannot set a dose (R² 0-0.54). The soil probe explains why a leaf is low; it does not measure the shortage.
5. **Sell to the people who already advise many farms.** Picketa's buyer is the agronomist and the retailer, at US$10,000 a year. In Cambodia, pest-control service providers charge farmers about US$10/ha (`agrirover-business-review.md`). A rover is a service-provider tool before it is a farmer's.
6. **One crop, one region, one season of case studies, then raise.** Picketa's first C$300k bought exactly that. Ours: guava, Siem Reap, one block split guided against usual for a cycle.

## What we do not copy
- **Their crops.** Guava only for now.
- **13 nutrients on day one.** We start with N, P, K, Mg as low / OK / high, because low-cost scanners are weak beyond N ([GUAVA-RESEARCH.md](GUAVA-RESEARCH.md)).
- **Their savings figure** (up to 20 %) is the company's own. Do not quote it as ours, or as theirs without "company says".
- **Their accuracy figures** are for potato. Nothing is known for guava.
