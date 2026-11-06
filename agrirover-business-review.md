# AgriRover — Business-first review & Musk 5-step plan
> **Superseded on direction, 5 Nov 2026:** Daivai made the rover the main product and guava the one crop. See `docs/PLAN.md`. This review's evidence and warnings still stand: name a paying grower, and prove the value before building more.

4 Nov 2026 · Reviewed: "Agri-Rover Features and Naming" PDF (27 pp, AI-generated memo)

## Verdict on the PDF
- Feature-and-naming memo, not a business case: no named customer, crop, Cambodian price or payer; economics are US corn farms.
- Strongest point: its own Stage 1 has no rover.
- Keep the name AgriRover (already submitted to CDA).

## What AgriRover actually solves
Farmers would pay to stop finding out too late that plants are thirsty or sick, and to stop paying people to walk every row. The rover is one way to carry the camera, not the product.

Cambodia evidence
- Labour: rural youth migration → peak-season labour shortages, rising rural wages (MAFF 2017). Hired pesticide spraying up to $18–25/ha (Future Farming 2022).
- Disease: cassava mosaic virus spread via infected stem cuttings through most main cassava regions (>500,000 ha); choosing symptom-free plants for cuttings cuts losses (Agronomy 2022). Not always visible → camera = triage, not diagnosis (CIAT).
- Payment model: farmers pay ~$10/ha to pest-control service providers; a Battambang drone service needed a 50% donor subsidy (CAVAC II) before farmers tried it (Phnom Penh Post).
- Implication: price per ha per season; free/subsidised first season; bundle the insight with physical service (install, irrigation) — information alone is a hard sell.

## PDF claims to drop or fix
- "12 MB EfficientNet-B4 + ViT ensemble": B4 alone ≈ 19 M parameters (~19 MB at int8).
- Thermal CWSI: weak in humid climates; FLIR Lepton 3.5 rated ±5 °C typical.
- "<$250 kit" incl. radiometric thermal: Lepton 3.5 core alone ≈ $164.
- "84 h early", "R² 0.94": single-study figures, not ours.
- RTK/NTRIP is feasible later: Khmer GEONET broadcasts network RTK (VRS).

## Musk 5-step plan
1. Every requirement has a named owner. No farmer named within 2 weeks → delete.

| Requirement | Who asked | Verdict |
|---|---|---|
| Drive the field autonomously | Daivai, for CDA | CDA demo only |
| When/how much to water | Daivai, guava block | Keep — test first |
| Spot sick plants early | No named farmer yet | Keep — name a grower; phone photo first |
| Thermal camera | PDF | Delete |
| NPK/pH probe | First feature list | Delete |
| Yield prediction | First feature list | Delete (needs seasons of data) |
| Onboard watering/spraying | First feature list | Delete |
| RTK GPS | PDF | Defer |

2. Delete: rover from the first product, all "Delete" rows, renaming. Expect to add one back; if not, cut more.
3. Simplify: one crop, one decision, one daily message. Field node + soil probes at 2 depths calibrated to site soil + existing rule engine → "Zone B: water 20 min · Zone C: skip". Disease: phone photo → model.
4. Accelerate: weekly cycles. Week-0 baseline (how watering is decided, time spent checking, losses); split guava block sensor-guided vs usual, compare at 4–6 weeks; 10 farmer interviews around Siem Reap (last season's losses, what they pay per ha, would they pay $X). Guava block: the fish system's daily exchange sets the volume → measure even distribution / no waterlogging, not water saved.
5. Automate last: message → farmer acts → auto-valve once trusted → rover/drone scouting only when scouting labour is the measured bottleneck and farms pay.

## Two tracks
- CDA: rover stays as the research demo.
- Business: Stage 1 sells the decision; rover + drone = Stage-2 scouting service.

## Effect on pending work
- BOM → two lists: Stage-1 sensing kit; rover v2 trimmed (no thermal/NPK/RTK; ArduPilot for driving).
- Deck: one problem → one platform (AI Auto Farm) → ground (field nodes + AgriRover), air (drone), quality (cassava grading) → staged plan.

## Sources
- CDRI WP107, labour movement & mechanisation: https://cdri.org.kh/new/?p=33047
- MAFF Agricultural Engineering, mechanization strategy (UN-CSAM 2017): https://un-csam.org/sites/default/files/2020-11/2.%20PPT_Cambodia_Saruth%20Chan.pdf
- Future Farming 2022, spraying drones & cassava: https://futurefarming.com/tech-in-focus/drones/spraying-drones-help-cassava-growers-in-cambodia-increase-yield
- Phnom Penh Post, Red Sparrow (~$10/ha): https://phnompenhpost.com/post-focus/red-sparrow-drones-take-flight-aid-farmers-fight-against-pests
- Phnom Penh Post, Battambang drone service (CAVAC II 50%): https://m.phnompenhpost.com/lifestyle-creativity-innovation/battambang-womans-drone-service-aims-high
- Agronomy 2022, 12(7):1658, SLCMV yield impacts: https://www.mdpi.com/2073-4395/12/7/1658
- CIAT/EurekAlert, CMD baseline Vietnam & Cambodia: https://www.eurekalert.org/news-releases/758107
- CWSI in humid climates (strawberry): https://doi.org/10.29312/remexca.v17i1.3971
- Teledyne FLIR Lepton series datasheet: https://www.acalbfi.com/file/12305/Lepton-Series-Datasheet-3.pdf
- DigiKey, Lepton 3.5: https://www.digikey.com/es/product-highlight/f/flir/lepton-3-radiometry
- JICA, Khmer GEONET: https://openjicareport.jica.go.jp/pdf/12388740_04.pdf
