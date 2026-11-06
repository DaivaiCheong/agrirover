# Picketa Systems (LENS): what they do, what is proven, what AgriRover should copy (6 Nov 2026)

Sources were search summaries of the pages linked; no Picketa page was fetched directly. "Company" marks a claim from Picketa or a press release, not a test.

## The business in one line
A grower waits 4-10 days for a leaf-tissue lab result, so feed decisions come too late. LENS scans leaves in the field and returns 13 nutrients in minutes. ([Huddle](https://huddle.today/2022/05/04/meet-the-company-uprooting-atlantic-canadas-potato-industry/), [CropLife](https://www.croplife.com/precision-tech/crop-nutrient-management-how-the-picketa-lens-tool-is-providing-real-time-plant-tissue-analysis/))

| | Picketa |
|---|---|
| Problem | Lab tissue tests take days; fertiliser on PEI rose 75-100 % in a year ([PotatoPro](https://www.potatopro.com/node/133030)) |
| How | 10-15 healthy leaves per area, each scanned by an optical probe; reflectance across a wide spectrum goes to cloud machine-learning models (chemometrics) ([CropLife](https://www.croplife.com/precision-tech/crop-nutrient-management-how-the-picketa-lens-tool-is-providing-real-time-plant-tissue-analysis/)) |
| Process they sell | 1 Collect leaves · 2 Scan with LENS · 3 Take action (picketa.com) |
| Who pays | Agronomists and ag retailers, not single farms: 45 retailers in North America ([PotatoPro 2026](https://www.potatopro.com/node/173342)) |
| Price | US$10,000 a year: hardware, unlimited sampling, support and Fieldbook software (same) |
| Crops | Potato first (PEI and New Brunswick, built with farmers since 2021), then corn, canola, soy, wheat |
| Money raised | ~C$300k 2022 to validate the method and get one season of case studies; C$1.4M seed 2023; C$2.1M 2026 ([PotatoPro](https://www.potatopro.com/node/133030), [PotatoPro 2023](https://www.potatopro.com/es/news/2023/picketa-systems-deploys-new-lens™-tissue-analysis-system-usd-14m-seed-round), [AgFunder](https://agfundernews.com/picketa-raises-1-5m-to-bring-crop-nutrient-testing-to-the-field)) |
| Value claim | Up to 20 % less in-season fertiliser. **Company** |

## What is proven, and what is not
| Claim | Evidence | Status |
|---|---|---|
| N, P, K within 2-3 % of the lab on potato, micronutrients 6-8 % | Three years of potato trials ([Producer](https://www.producer.com/?p=284806)) | **Company**, trade press |
| Works on corn | Independent preprint, Nebraska, 4 N rates × 4 reps: LENS read N at 4.4-4.6 % where the lab read 2.9-3.2 %, and found no treatment effect; P, K, Ca also read high (K ~40 %) ([Research Square, Dec 2025](https://sciety.org/articles/activity/10.21203/rs.3.rs-8371845/v1)) | **Not shown** for that crop and model year. Abstract only seen |
| Calibration | Each new crop: paired samples, one scanned, one to a certified lab; university partners Guelph, Missouri, Nebraska, Cornell ([CropLife](https://www.croplife.com/precision-tech/crop-nutrient-management-how-the-picketa-lens-tool-is-providing-real-time-plant-tissue-analysis/)) | Method stated |
| Independent check under way | Olds College paired device and lab results across crops; Picketa funds it ([Olds College](https://www.oldscollege.ca/smart-farm-research/research-projects/smart-ag/current/in-field-nutrient-analysis.html)) | In progress, not independent of funding |

**Lesson:** even a funded, university-backed sensor failed an independent test on a crop it was not built for. A model is only as good as the crop and site it was calibrated on.

## What AgriRover should copy
1. **Start from a measured problem, not an assumed one.** Picketa began with growers who already paid for lab tests and waited days. Our equivalent: the hand-carried probe round (`PLAN.md` step 4.2). Do trees in one guava block really differ? Until that is measured, the rover's value is assumed.
2. **Three steps a farmer can repeat.** Collect → Scan → Act. Ours: **Read** (the rover's round) → **Find** (the trees with a problem, with the number that shows it) → **Act** (one thing to do). Every screen shows those three, and nothing that does not lead to an action.
3. **Paired samples before any claim.** Picketa pairs each scan with a certified lab result. Ours: each probe reading against a weighed soil sample and a lab EC; each photo answer against an expert's label. The photo library already pairs them; the probe needs the same.
4. **Sell to the people who already advise many farms.** Picketa's buyer is the agronomist and the retailer, at US$10,000 a year. In Cambodia, pest-control service providers charge farmers about US$10/ha (`agrirover-business-review.md`). A rover is a service-provider tool before it is a farmer's.
5. **One crop, one region, one season of case studies, then raise.** Picketa's first C$300k bought exactly that. Ours: guava, Siem Reap, one block split guided against usual for a cycle.
6. **The leaf, not the cheap soil probe, sets the dose.** Picketa measures leaf tissue. Our research says the same: a low-cost N-P-K probe cannot set a dose (R² 0-0.54), and a leaf test should correct it. A field leaf scanner is a possible partner or a later product; guava is not among Picketa's crops.

## What not to copy
- Their savings figure (up to 20 %) is the company's own. Do not quote it as ours, or as theirs without "company says".
- Their accuracy figures are for potato. Nothing is known for guava.
