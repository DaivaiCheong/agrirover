# Guava and orchard rovers: what China and the studies show (2026-11-05)

**Honesty about reading.** "Read" means the source's text was opened and the numbers are quoted from it. "Summary only" means only a search-result excerpt was seen, because the page refused the fetch, so check it before citing further.

## What this changed in the design

1. **Rover survey plus water-and-fertiliser advice is how China's smart orchards are organised.** Sensing feeds a platform, and the platform sets water and feed. Our rover is the sensing, and the app is the platform.
2. **N, P and K from a cheap probe must not set a fertiliser dose.** They are shown but never used in the sums. Doses come from the stage plan, are held back by EC, and are checked by a leaf test.
3. **GPS alone will not work under guava trees.** China's orchard robots combine GNSS with LiDAR. The rover design changed.
4. **"Less water" has a limit, and it depends on the stage.** Water deficit at flowering and fruit growth costs fruit size. A deficit at ripening raises sugar but cost yield in the one study that split it by stage.

## How China does it

| Finding | Source | Status |
|---|---|---|
| Smart orchards combine sensors, a water-fertiliser system and a management platform. One 30 ha demonstration used more than 10 sensor types and 28 machines | He et al. 2022, [Smart Agriculture 4(3)](https://www.smartag.net.cn/CN/abstract/abstract21642.shtml) | Read (abstract) |
| That demonstration reports water down 60-70 %, fertiliser down 25-35 %, labour cost down over 50 % | Same | Read. **No control design is stated on the page, and it is a pear and peach orchard. Do not quote as expected savings** |
| Beijing Changping orchard: water and feed are set from soil moisture and tree needs; drones and robot dogs inspect; advice reaches a phone app. Water saved over 30 %, fertiliser efficiency up 15 %, labour down 40 % | [Science and Technology Daily, Oct 2025](https://www.stdaily.com/web/gdxw/2025-10/24/content_420840.html) | Read. An expert's statement in a news report, not a trial |
| Tianjin showcase orchard reports the same two figures | [Beijing Daily](https://xinwen.bjd.com.cn/content/s6724aee9e4b0f72813bd7fa0.html) | Summary only |
| Hubei citrus base uses inspection robots among its machines and reports labour savings | [Hubei agriculture centre](http://hbnysy.hubei.gov.cn/bmdt/ztzl/nykjcs/njnykjcs/njjs/202512/t20251223_5840202.shtml) | Summary only |
| Jiangsu University orchard inspection robot: ROS, LiDAR-SLAM fused with IMU and GNSS. Stops at a waypoint within about 0.16 m sideways and 0.28 m along the row | [Sensors 25(21):6662](https://www.mdpi.com/1424-8220/25/21/6662) | Summary only (page refused) |
| GNSS degrades under canopy, so it cannot be the only position source | [GNSS and vision for orchard robots](https://www.mdpi.com/2673-2688/7/4/125) | Summary only |

**Guava in China.** No guava-specific fertigation rate or irrigation schedule from Guangdong or Fujian turned up. China's practice below is general, or from older extension notes:

| Finding | Source | Status |
|---|---|---|
| Fujian Longhai guava: N:P:K 1 : 0.5-1 : 1-2. Yearly feed split 30 % shoots and flowers, 30 % fruit set and enlargement (every 10 days), 40 % harvest period. Over 60 % of N from organic sources. Bag at 2-3 cm. Canopy about 2 m | [Reprinted by Hunan Forestry, 2017](http://lyj.hunan.gov.cn/tslm_71206/lykp/syjs/201708/t20170819_4413796.html) | Read. No grams per tree and no water figures |
| Guangdong drip fertigation demonstration including guava: water down about half, fertiliser down about 30 %, about 1,000 yuan per mu, 8-10 year life, filter at 120 mesh or finer, "little and often" | [Guangdong agriculture department](https://dara.gd.gov.cn/snnyxxlb/content/mpost_1491053.html) | Summary only (page now 404). An older report |
| Fujian variety paper: 6-8 top dressings a year, adjusted to tree vigour and fruit load | [Fujian Agricultural Science and Technology 2024](http://fjnk.fjnyxb.cn/cn/article/pdf/preview/10.13651/j.cnki.fjnykj.2024.06.010.pdf) | Summary only |

Sellers' pages claiming 10-30 % higher guava yield from fertigation gave no source, so they are not used.

## Water: how far can it be cut?

| Finding | Source | Status |
|---|---|---|
| Guava at 100 % ETc gave 18.7 t/ha; at 60 % ETc, 11.0 t/ha | [Drip and N fertigation study](https://www.researchgate.net/publication/314116610_INFLUENCE_OF_DRIP_IRRIGATION_AND_NITROGEN_FERTIGATION_ON_YIELD_AND_WATER_PRODUCTIVITY_OF_GUAVA) | Summary only |
| 75 % ETc with silver-black mulch during fruit growth gave the best fruit number and yield per tree, and better water productivity. 50 % ETc gave the highest sugar (12.4-12.8 °Brix) | [VNR Bihi trial, Pantnagar, India](https://doaj.org/article/1bddbba9fb6147ae8ef6cd44fe165571) | Summary only |
| 50 % ETc by stage, Paluma, Brazil. Full water: 10,965 kg/ha, 12.6 °Brix. Deficit at fruiting cut fruit weight (145-165 g against 160-205 g). Deficit at ripening raised sugar to 14.1 °Brix but cut yield to 4,917 kg/ha | [Lacerda et al. 2026, Ciência Rural 56(5)](https://new.scielo.br/j/cr/a/fGcdhVMXk9jrBChTbZLyhHc/?lang=en) | Read. One season, and its tables and text disagree in places |
| Clay soil trial, Egypt: fruit quality not significantly affected by water regime | [Egyptian trial](https://asejaiqjsae.journals.ekb.eg/article_101396_d936d706fb3e1ebe3df9a1a827e71057.pdf) | Summary only |

**What the app does with this:** it never waters a tree whose soil is already in the upper half of its target, and never goes above the stage's full demand. It does not apply a blanket cut. **To test:** one bed at 75 % ETc with mulch during fruit growth, compared with a normal bed.

## Fertiliser: too much, too little, and taste

| Finding | Source | Status |
|---|---|---|
| **Low-cost NPK probes:** against lab tests, R² from about 0 to 0.25 on 10 soils; on 63 soils at fixed moisture, adjusted R² 0.05-0.48 for N and P, up to 0.54 for K. Readings depend strongly on soil moisture. "Do not possess sufficient accuracy for ... the prescription of fertilizer doses" | Estrada et al., [Alliance Bioversity-CIAT technical report](https://cgspace.cgiar.org/server/api/core/bitstreams/fe955214-2ee7-490a-9f63-1d5a7fa09f96/content) | Read |
| One seller states its N, P and K "are estimated from electrical conductivity" rather than measured | [Vendor page](https://sigmanortec.ro/en/7-in-1-soil-sensor-n-p-k-ph-ec-moisture-temperature-rs485-530v) | Summary only |
| Leaf ranges for bearing Paluma orchards, São Paulo (168 samples): N 18-21, P 1.5-1.7, K 15-17, Ca 8-11, Mg 1.8-2.5, S 2.5-2.9 g/kg; B 26-38, Cu 5-57, Fe 54-112, Mn 53-101, Zn 13-126 mg/kg. Most limiting: Fe, then K, then Mn | Souza et al. 2013, [Rev. Bras. Frutic. 35(1)](https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/973688/1/apiNormaspreliminares.pdf) | Read. Another country and cultivar: a starting reference |
| High potassium raised sugar and vitamin C; higher nitrogen raised yield and fruit set | [Pant Prabhat trial, J. Hort. Sci. 2008](https://jhs.iihr.res.in/index.php/jhs/article/view/594) | Summary only |
| N or K shortage: low vigour, yellowing, light roots | [Embrapa study](https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/160508/1/Barbara.pdf) | Summary only |
| Boron helps move sugars. Zinc and manganese shortages lower quality | [Foliar study](https://phytojournal.com/archives/2019/vol8issue3/PartAT/8-3-225-891.pdf) | Summary only |

**Not found:** direct evidence that excess nitrogen lowers guava sugar. The app's rule of no nitrogen before harvest comes from the guava document, not a study found here.

## Photo check: what was measured (2026-11-05)

Test photos: [BD Guava Fruit and Leaf Disease Dataset v5](https://data.mendeley.com/datasets/rgp9xy5gy2) (CC BY 4.0), Bangladesh, monsoon: 1,092 photos, 10 classes, YOLO labels. **It has no anthracnose and no wilt**, and many photos are picked leaves on a plain background, so these scores say little about a rover's view of a tree. Most classes come from one or two collection sessions, so disease and session are tangled.

| Test | Result | What it means |
|---|---|---|
| Gemma 4 (`gemma4`, local, RTX 2080 Super, about 3 s a photo), 123 photos, asked to name the disease | Named a disease on 30 sick photos: 6 right. Said anthracnose 22 times, all wrong. 73 unsure | Must not name diseases. Each false anthracnose would have told a farmer to cut water and remove fruit |
| Gemma 4, same photos, asked healthy, problem or unsure | 112 of 121 right, 2 unsure. Missed 5 of 99 sick (4 insect bites). False alarm on 4 of 24 healthy (all fruit) | Usable as a first screen. The prompt was changed after seeing these photos, so this is optimistic. This is the app's setting |
| MobileNetV3-Small trained on the dataset (random 70/15/15 split, 169 test photos, about 1 minute on the GPU, 6 MB) | 91.1 % across the 10 classes. Sick called healthy 3 of 118, healthy called sick 0 of 51 | Promising, but see the next row. Not installed in the app |
| The same model, leaf or fruit blacked out using the dataset's boxes | **51.5 %**, where always guessing the biggest class gets 16 % | A large part of the 91 % comes from something other than the disease: session, background or box shape. Not proof it works in our orchard |

**Does a written guide help? (same day)** The guide is `services/guava_diseases.py`, also the Disease guide screen. Scored on 150 photos of the same dataset never used to tune anything, 15 a class. The set has no anthracnose. Red rust counted as algal leaf spot.

| Test | Disease named right | Said anthracnose | Sick called healthy | Healthy called sick |
|---|---|---|---|---|
| Hosted `gemma4:31b`, one step, list of names only | 53 of 120 | 20 | 1 of 120 | 16 of 30 |
| Hosted `gemma4:31b`, one step, with the guide | 53 of 120 | 11 | 1 of 120 | 12 of 30 |
| Hosted `gemma4:31b`, the app's two steps with the guide | 52 of 120 | 7 | 0 of 120 | 22 of 30 |
| Local `gemma4`, the app's two steps with the guide (149 photos, 1 failed) | 18 of 119 | 27 | 11 of 119 | 7 of 30 |

So the guide cut false anthracnose but did not raise the number of right names. Local `gemma4` as healthy or problem got 130 of 148 right on these unseen photos, against 112 of 121 on the photos its prompt was tuned on. Local without the guide was not scored on this set: that run hung. Every other hosted vision model answered "not included in your free usage". Hosted runs sent only these public dataset photos.

**Which leaves carry the signs (6 Nov).** A farm photo of old leaves reddened between green veins, with clean new growth, came back "Guava rust". Rust attacks young, soft growth and shoot tips first ([NVWA quick scan](https://english.nvwa.nl/binaries/nvwa-en/documenten/plant/plant-health/pest-risk-analysis/documents/quick-scan-austropuccinia-psidii/quick-scan-austropuccinia-psidii.pdf); no symptoms on old leaves of 'Paluma' in [this study](https://agris.fao.org/search/en/records/65decd12b766d82b18fe6c04)), while magnesium shortage starts on the oldest leaves, yellow, bronze or reddish between green veins ([Vikaspedia](https://vikaspedia.in/agriculture/crop-production/integrated-pest-managment/ipm-for-fruit-crops/ipm-strategies-for-guava/nutritional-deficiencies-of-guava)). The guide now says so, and versions of the match step were scored on the same 150 held-out photos, with the same screen results (hosted `gemma4:31b`):

| Match step | Named right | Right in top two | Said rust | Said anthracnose | Against the old step |
|---|---|---|---|---|---|
| Old guide and prompt | 52 of 120 | 66 | 12 | 7 | |
| New guide, old prompt | 58 | 69 | 3 | 9 | 6 fixed, 0 broken |
| **New guide, `where` (which leaves) before the name: the app's setting** | **61** | **72** | 6 | 9 | 10 fixed, 1 broken |
| New guide, `where` and a forced list of sign types | 51 | 67 | 7 | 8 | 3 fixed, 4 broken |
| New guide, `where` and a shorter sign list (first try) | 49 | 64 | 5 | 6 | 4 fixed, 7 broken |

The farm photo came back "Yellow leaves from feed or soil" under the three new-guide versions. The forced sign list hurt because it had no word for some signs (mealybug's white clusters, scorch's dead edges). **Caveat:** the winner was picked on these same 150 photos, so 61 is optimistic; the app still says "about 4 in 10" until it is scored on photos it was not chosen on. The healthy-or-problem screen, unchanged, called 21 of 30 healthy photos a problem on this run: it is now the weaker step.

**Rule from this:** no disease name reaches a farmer until a model passes on Siem Reap photos from sessions it never trained on. `scripts/eval_photo_check.py` scores any Ollama model on a folder of labelled photos. Who confirms labels and how to take the photos: [PHOTO-LABELLING.md](PHOTO-LABELLING.md).

Wider evidence: models trained on PlantVillage lab photos drop from above 99 % to below 30 % on field photos ([Kyushu 2025](https://catalog.lib.kyushu-u.ac.jp/opac_download_md/7395548/2025_p0402.pdf), summary only). Anthracnose spreads under humid conditions, rust in warm humid weather, and algal spot with wet conditions and splashing water, where guava in high rainfall is a crop that can need control ([IPM Guava](https://agritech.tnau.ac.in/horticulture/pdf/tech_bulletin/national/IPM-GUAVA-Revised-Sept2011.pdf), [Pacific Pests](https://apps.lucidcentral.org/ppp/text/web_full/entities/algal_leaf_spot_148.htm), summaries only). No source found links soil moisture to anthracnose, so the app says wet soil is not the cause.

## Open

- The guava document's own numbers remain unchecked (see [GUAVA-REQUIREMENTS.md](GUAVA-REQUIREMENTS.md)).
- Chinese-language journals (CNKI) were not searched directly, so guava-specific Chinese trials may exist.
- No source gives a rover-specific saving: the Chinese figures are for whole systems. AgriRover's value must be measured on your own orchard.
