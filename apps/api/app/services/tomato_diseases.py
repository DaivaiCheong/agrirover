"""The tomato disease guide: what the photo AI reads before it answers on a tomato block, and what a farmer reads.

Written on 2026-11-27 from standard extension descriptions of tomato diseases and disorders (the sources below), for
tomato grown in the open in the tropics. The source pages were not re-read for this guide and no link was checked:
have an agronomist look it over before it is relied on. Like the guava guide it names no spray dose: a product and a
dose come from an agronomist or the product's label.

`symptom` stays empty: the soil-and-air rules behind it (guava.SYMPTOMS) are written for guava. The tomato block's
readings are rated by tomato.py instead.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from app.services.guava_diseases import Disease

SOURCES = {
    "extension": ("University extension vegetable guides (Cornell, Minnesota, Florida): tomato diseases", ""),
    "worldveg": ("World Vegetable Center, tomato diseases and pests in the tropics", ""),
    "apsnet": ("APS, Compendium of Tomato Diseases and Pests", ""),
}


@dataclass(frozen=True)
class TomatoDisease(Disease):
    def to_dict(self) -> dict:
        d = asdict(self)
        d["notToConfuse"] = d.pop("not_to_confuse")
        d["sources"] = [{"title": SOURCES[s][0], "url": SOURCES[s][1]} for s in self.sources]
        group, signs, steps, ask = CARDS[self.id]
        d["card"] = {"group": group, "signs": signs, "steps": list(steps), "askFirst": ask}
        return d


CARDS: dict[str, tuple[str, str, tuple[str, ...], bool]] = {
    "early_blight":    ("fungus", "Brown spots with rings, old leaves first", ("Remove spotted lower leaves", "Mulch: no soil splash", "Water the soil, not the leaves"), True),
    "late_blight":     ("water mould", "Large greasy grey-brown patches, fast", ("Remove and destroy sick plants today", "Do not compost them", "Ask about a spray now"), True),
    "septoria":        ("fungus", "Many small spots with grey centres", ("Remove spotted lower leaves", "Mulch, water the soil"), True),
    "bacterial_spot":  ("bacteria", "Tiny dark greasy spots, scabby fruit", ("Do not work wet plants", "Remove the worst leaves", "Clean seed and seedlings next time"), True),
    "leaf_mold":       ("fungus", "Yellow patches, olive fuzz underneath", ("Open the canopy for air", "Lower the humidity"), True),
    "tylcv":           ("virus", "Small, cupped, yellow-edged young leaves", ("Pull out sick plants early", "Control whitefly", "Resistant varieties next time"), False),
    "virus_mosaic":    ("virus", "Light and dark green mottle, twisted leaves", ("Pull out sick plants", "Wash hands and tools", "Control aphids"), False),
    "wilt":            ("roots", "Whole plant wilts though the soil is wet", ("Cut a stem: milky ooze or brown streaks?", "Remove wilted plants", "Do not over-water"), False),
    "blossom_end_rot": ("feed", "Dark sunken patch at the fruit's bottom", ("Keep the water even", "Check soil pH and EC", "Not a germ: no spray"), False),
    "chlorosis":       ("feed", "Yellow leaves, or yellow between green veins", ("Check the soil readings", "Take a leaf test"), False),
    "whitefly":        ("insect", "Tiny white insects under leaves, sticky film", ("Yellow sticky traps", "Net the seedlings", "Watch for leaf curl virus"), False),
    "leaf_miner":      ("insect", "Winding white trails or blotches in leaves", ("Remove mined leaves", "Find the insect before treating"), False),
    "fruit_borer":     ("insect", "Round holes in fruit, droppings", ("Pick and destroy bored fruit", "Pheromone traps"), False),
    "cracking":        ("water", "Splits around or down the fruit", ("Keep the water even: little and often", "Pick fruit as it colours"), False),
}


DISEASES = (
    TomatoDisease("early_blight", "Early blight", "Fungus (Alternaria)",
                  "Brown spots up to about 1 cm with dark rings inside like a target, often with a yellow halo. Oldest, lowest leaves first, "
                  "then up the plant. Dark lesions on stems.",
                  "Dark, leathery, sunken spots at the stem end, with rings.",
                  "Septoria spots are small (2-5 mm), many, with grey centres and no rings. Late blight patches are large, greasy and spread fast.",
                  "Warm (about 24-29 °C), humid weather with dew or rain on the leaves. Spores splash up from the soil.",
                  "Remove spotted lower leaves. Mulch so soil does not splash. Water the soil, not the leaves. Rotate away from tomato, potato "
                  "and eggplant for 2-3 years. Ask an agronomist about a spray.", ("extension", "worldveg", "apsnet")),
    TomatoDisease("late_blight", "Late blight", "Water mould (Phytophthora infestans)",
                  "Large, irregular, grey-green to brown patches that look wet or greasy, often from the leaf edge. White fuzz under the leaf in "
                  "humid weather. Dark brown patches on stems. Can kill a plant in days.",
                  "Firm, greasy brown patches, usually on green fruit.",
                  "Early blight spots are smaller, dry and ringed. Late blight is large, greasy and moves fast in cool, wet weather.",
                  "Cool (about 15-22 °C), wet weather with long leaf wetness: the rainy season and the highlands.",
                  "Remove and destroy sick plants at once: do not compost them. Water the soil, not the leaves. It spreads fast: ask an "
                  "agronomist about a spray now.", ("extension", "worldveg", "apsnet")),
    TomatoDisease("septoria", "Septoria leaf spot", "Fungus (Septoria lycopersici)",
                  "Many small round spots, 2-5 mm, with grey or white centres and dark borders, sometimes tiny black dots in the centre. "
                  "Lower leaves first; they yellow and drop.",
                  "Rarely on the fruit.",
                  "Early blight spots are larger with rings. Bacterial spots are smaller, darker and greasy, without grey centres.",
                  "Warm, wet weather and splashing water.",
                  "Remove spotted lower leaves, mulch, and water the soil. Ask an agronomist about a spray.", ("extension", "apsnet")),
    TomatoDisease("bacterial_spot", "Bacterial spot and speck", "Bacteria (Xanthomonas, Pseudomonas)",
                  "Tiny dark spots, 1-3 mm, that look greasy or water-soaked, sometimes with a yellow halo; they can join and scorch the leaf.",
                  "Small raised, scabby or black specks on green fruit.",
                  "Septoria spots have grey centres. A photo cannot tell spot from speck: the treatment is the same.",
                  "Warm, wet weather, splashing rain and overhead water. Carried on seed and seedlings.",
                  "Do not work among wet plants. Remove the worst leaves. Use clean seed and seedlings next time. Copper sprays slow it: "
                  "ask an agronomist.", ("extension", "worldveg", "apsnet")),
    TomatoDisease("leaf_mold", "Leaf mould", "Fungus (Passalora fulva)",
                  "Pale green to yellow patches on the upper leaf; under them an olive-green to brown velvety mould.",
                  None,
                  "Early blight has ringed brown spots. Leaf mould shows its fuzz on the underside: turn the leaf over.",
                  "Humidity above about 85 %, still air: tunnels, greenhouses and dense canopies.",
                  "Open the canopy and let air through; lower the humidity. Ask an agronomist about a spray.", ("extension", "apsnet")),
    TomatoDisease("tylcv", "Yellow leaf curl virus", "Virus (TYLCV), spread by whitefly",
                  "Young leaves small, cupped upward and crumpled, with yellow edges. Plant stunted and bushy; few flowers, which drop.",
                  "Few fruit set.",
                  "Feed shortages yellow the leaves without curling them small. Mosaic virus mottles the colour. Whitefly nearby points to this.",
                  "Whitefly, which builds up in hot, dry weather.",
                  "No cure: pull out sick plants early so whitefly cannot carry it on. Control whitefly (yellow sticky traps, nets on "
                  "seedlings). Plant resistant varieties next time.", ("worldveg", "extension", "apsnet")),
    TomatoDisease("virus_mosaic", "Mosaic viruses", "Virus (ToMV, CMV and others)",
                  "Light and dark green mottle on the leaves, which may be twisted, narrow or fern-like.",
                  "Uneven ripening, mottled or brown streaks inside.",
                  "Leaf curl virus cups the young leaves small and yellow-edged. A feed shortage yellows evenly or between the veins, without mottle.",
                  "Spread on hands and tools (ToMV) or by aphids (CMV).",
                  "No cure: pull out sick plants. Wash hands and tools between plants. Control aphids.", ("extension", "apsnet")),
    TomatoDisease("wilt", "Wilt: bacterial or Fusarium", "Bacteria (Ralstonia) or soil fungus (Fusarium)",
                  "Bacterial wilt: the whole plant wilts while still green, first in the heat of the day, then for good. Fusarium: lower "
                  "leaves yellow, often on one side, then the plant wilts.",
                  None,
                  "A photo cannot tell these apart, or tell them from a dry soil. Cut the stem near the ground: milky threads streaming into a "
                  "glass of water mean bacterial wilt; brown streaks inside mean a vascular wilt.",
                  "Hot, wet soil (bacterial wilt is common in lowland tropics). Both live in the soil for years.",
                  "Remove wilted plants with their roots. Do not over-water. Do not replant tomato, potato, eggplant or chilli there; use grafted "
                  "or resistant plants next time.", ("worldveg", "extension", "apsnet")),
    TomatoDisease("blossom_end_rot", "Blossom-end rot", "Calcium shortage in the fruit, not a germ",
                  None,
                  "A water-soaked patch at the bottom (blossom end) of the fruit that turns dark, leathery and sunken.",
                  "Sunscald is pale and papery on the side facing the sun. Rots from germs are soft and spread.",
                  "Uneven watering, acid soil (pH below 5.5), salty soil (high EC) or too much potassium or ammonium (Mulder's chart): "
                  "calcium does not reach the fruit.",
                  "Keep the water even. Check soil pH and EC on the Farm screen. Not a germ: no spray. Remove spoiled fruit.",
                  ("extension", "apsnet")),
    TomatoDisease("chlorosis", "Yellow leaves from feed or soil", "Nutrient shortage or soil, not a germ",
                  "Nitrogen: whole older leaves pale and yellow. Magnesium: yellow between green veins on older leaves. Iron: young leaves "
                  "yellow with green veins. Potassium: brown, scorched edges on older leaves.",
                  None,
                  "Even yellowing without spots points to feed or soil, not a germ. Leaf curl virus also yellows, but cups the young leaves.",
                  "Acid or alkaline soil, too little feed, or one nutrient blocking another (Mulder's chart).",
                  "Check the soil readings and take a leaf test. No fungicide for this alone.", ("extension", "apsnet")),
    TomatoDisease("whitefly", "Whitefly", "Insect (Bemisia tabaci)",
                  "Tiny white flying insects under the leaves, sticky film, black sooty mould on lower leaves.",
                  None,
                  "Its worst harm is the leaf curl virus it carries: look at the young leaves too.",
                  "Hot, dry weather.",
                  "Yellow sticky traps, nets over seedlings, remove weeds around the block. Find out what to spray from an agronomist: "
                  "whitefly resists many insecticides.", ("worldveg", "extension")),
    TomatoDisease("leaf_miner", "Leaf miner and Tuta", "Insect larvae (Liriomyza, Tuta absoluta)",
                  "Winding white trails (leaf miner) or pale blotches with dark droppings inside (Tuta) in the leaves.",
                  "Tuta also bores small holes in fruit.",
                  "Disease spots stay as spots. Trails and blotches you can see through are larvae feeding inside the leaf.",
                  "Warm weather, all year in the tropics.",
                  "Remove and destroy mined leaves. Pheromone traps for Tuta. Find the insect before treating.", ("worldveg", "extension")),
    TomatoDisease("fruit_borer", "Fruit borer", "Caterpillar (Helicoverpa armigera)",
                  "Chewed leaves and flowers.",
                  "Round holes in green or ripe fruit, often near the stalk, with droppings; a caterpillar inside.",
                  "Bird pecks are shallow and torn. Borer holes are round and go deep.",
                  "Flowering and fruiting time.",
                  "Pick and destroy bored fruit. Pheromone traps. Ask an agronomist before spraying.", ("worldveg", "extension")),
    TomatoDisease("cracking", "Fruit cracking", "Water",
                  None, "Splits in rings around the stalk or running down the fruit, usually as it ripens.",
                  "Borer holes are round. Cracks follow a heavy rain or watering after a dry spell.",
                  "Uneven water: a dry spell, then heavy rain or a big watering.",
                  "Keep the water even, little and often. Pick fruit as it starts to colour.", ("extension",)),
)
BY_ID = {d.id: d for d in DISEASES}


def prompt_text() -> str:
    """The guide as the AI reads it."""
    lines = []
    for d in DISEASES:
        parts = [f"- {d.id} ({d.title})"]
        if d.leaf:
            parts.append(f"Leaf: {d.leaf}")
        if d.fruit:
            parts.append(f"Fruit: {d.fruit}")
        if d.not_to_confuse:
            parts.append(f"Not to confuse: {d.not_to_confuse}")
        lines.append(" ".join(parts))
    return "\n".join(lines)
