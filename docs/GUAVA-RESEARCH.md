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

## Open

- The guava document's own numbers remain unchecked (see [GUAVA-REQUIREMENTS.md](GUAVA-REQUIREMENTS.md)).
- Chinese-language journals (CNKI) were not searched directly, so guava-specific Chinese trials may exist.
- No source gives a rover-specific saving: the Chinese figures are for whole systems. AgriRover's value must be measured on your own orchard.
