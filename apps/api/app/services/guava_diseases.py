"""The guava disease guide: what the photo AI reads before it answers, and what a farmer reads on the Disease guide screen.

Only what the sources below say, read on 2026-11-05. `thin` marks an entry with little behind it. No page read gave a spray
dose for guava, so the guide names none: a product and a dose come from an agronomist or the product's label.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

SOURCES = {
    "growables": ("Growables, guava diseases", "https://growables.com/information/TropicalFruit/guavadiseases.htm"),
    "plantvillage": ("PlantVillage, guava", "https://plantvillage.psu.edu/topics/guava/infos"),
    "tnau": ("TNAU, organic plant protection", "https://agritech.tnau.ac.in/org_farm/orgfarm_hortidiseases.html"),
    "pacific": ("Pacific Pests and Pathogens, algal leaf spot", "https://apps.lucidcentral.org/ppp/text/web_full/entities/algal_leaf_spot_148.htm"),
    "gardening": ("Gardening Know How, guava diseases", "https://gardeningknowhow.com/edible/fruits/guava/common-guava-diseases.htm"),
    "florida": ("University of Florida, guava scab guide", "https://edis.ifas.ufl.edu/publication/PG133"),
    "agrifarming": ("Agri Farming, guava pests and diseases", "https://www.agrifarming.in/how-to-control-pests-and-diseases-in-guava-causes-symptoms-chemical-and-biological-management"),
    "vikaspedia": ("Vikaspedia, nutritional deficiencies of guava", "https://vikaspedia.in/agriculture/crop-production/integrated-pest-managment/ipm-for-fruit-crops/ipm-strategies-for-guava/nutritional-deficiencies-of-guava"),
    "taiwan": ("A study of mineral deficiency symptoms of guava", "https://core.ac.uk/display/41698116"),
    "guava_doc": ("The farm's guava document, not checked", ""),
    "bd_guava": ("BD Guava dataset: a class name, no description", "https://data.mendeley.com/datasets/rgp9xy5gy2"),
    "nvwa": ("NVWA, quick scan of Austropuccinia psidii", "https://english.nvwa.nl/binaries/nvwa-en/documenten/plant/plant-health/pest-risk-analysis/documents/quick-scan-austropuccinia-psidii/quick-scan-austropuccinia-psidii.pdf"),
    "paluma": ("Myrtle rust in guava leaves: no symptoms on old leaves of 'Paluma'", "https://agris.fao.org/search/en/records/65decd12b766d82b18fe6c04"),
}


@dataclass(frozen=True)
class Disease:
    id: str
    title: str
    kind: str
    leaf: str | None
    fruit: str | None
    not_to_confuse: str | None
    favours: str | None
    do: str
    sources: tuple[str, ...]
    symptom: str | None = None     # the rule in guava.SYMPTOMS that sets this against the soil and air
    thin: bool = False

    def to_dict(self) -> dict:
        d = asdict(self)
        d["notToConfuse"] = d.pop("not_to_confuse")
        d["sources"] = [{"title": SOURCES[s][0], "url": SOURCES[s][1]} for s in self.sources]
        group, signs, steps, ask = CARDS[self.id]
        d["card"] = {"group": group, "signs": signs, "steps": list(steps), "askFirst": ask}
        return d


# The same entries cut down for the photo result: what to look for in a few words, and two or three things to do.
# Nothing here goes beyond the entry above it. `askFirst` marks entries whose sources lean on a spray.
CARDS: dict[str, tuple[str, str, tuple[str, ...], bool]] = {
    "anthracnose":     ("fungus", "Sunken dark patches on ripe fruit", ("Prune to let in light and air", "Ask about a spray before flowering"), True),
    "algal_leaf_spot": ("alga", "Raised orange, silky tufts on leaves", ("Prune for air, remove weeds", "Fix drainage", "Keep the trees well fed"), True),
    "rust":            ("fungus", "Orange powder on young leaves", ("Keep the block clean", "Feed, water and prune well", "Check for it often"), True),
    "leaf_spot":       ("fungus", "Smoky brown patches with a dark border", ("Remove spotted leaves", "Prune the canopy for air"), True),
    "scab":            ("fungus", "Corky round spots on green fruit", ("Remove affected fruit",), True),
    "black_mold":      ("fungus", "Black mould on the fruit", ("Remove affected fruit", "Sticky film? Look for insects"), False),
    "mealybug":        ("insect", "White waxy clusters or flat scales", ("Collect and burn fallen material", "Horticultural oil or natural enemies"), False),
    "insect_damage":   ("insect", "Holes, chewed edges or silvery speckles", ("Find the insect before treating", "Keep away from onion and garlic"), False),
    "fruit_fly":       ("insect", "Puncture marks, soft fruit, larvae inside", ("Bag fruit at 3-4 cm", "Destroy infested fruit", "Set pheromone traps"), False),
    "chlorosis":       ("feed", "Yellow or reddish between veins, old leaves", ("Check the soil readings", "Take a leaf test"), False),
    "scorch":          ("feed", "Brown dead leaf edges", ("Check feed and water", "Take a leaf test"), False),
    "cracking":        ("water", "Splits on ripening fruit", ("Keep moisture steady: short drip pulses",), True),
    "guava_decline":   ("roots", "Whole tree yellow, drooping, dying back", ("Do not over-water", "Mulch and feed well", "Dig up roots, look for galls"), False),
}


DISEASES = (
    Disease("anthracnose", "Anthracnose", "Fungus (Colletotrichum gloeosporioides)",
            None, "Sunken, dark, dead patches on mature fruit, which can join into large patches. Pink spore masses in humid weather.",
            "Scab is corky and raised on green fruit. Anthracnose is sunken on mature fruit. The sources describe no guava leaf signs.",
            "High rainfall and humidity, warm wet weather. Spreads by water splash.",
            "Prune to open the canopy to light and air. Ask an agronomist about a spray before flowering and during fruit growth.",
            ("growables", "plantvillage", "tnau"), "anthracnose"),
    Disease("algal_leaf_spot", "Algal leaf spot (red rust)", "Parasitic alga (Cephaleuros virescens)",
            "Orange, rust-coloured, dense silky tufts, 5-8 mm, on both leaf faces. They turn reddish-purple or reddish-brown as they age.",
            "Irregular black spots on young fruit that distort it.",
            "Called red rust too. Guava rust is a powdery fungus on young growth. These are raised, silky tufts.",
            "Wet, humid weather and splashing water. Poor feed, poor drainage, too much or too little shade.",
            "Prune for air, remove weeds, fix drainage, keep trees well fed. Guava in high rainfall can need control: ask an agronomist.",
            ("growables", "plantvillage", "tnau", "pacific"), "algal_leaf_spot"),
    Disease("rust", "Guava rust", "Fungus (Puccinia psidii)",
            "Starts on young, soft, growing leaves and shoot tips: pale specks, then orange to yellow powdery pustules. Leaves distort and drop. Older leaves: round brown spots with dark borders and yellow halos.",
            "Orange to red pustules on fruit and flowers.",
            "Algal leaf spot is silky and raised, not powdery. Old leaves coloured between the veins while the new growth is clean is a feed shortage, not rust: rust hits the young growth first.",
            "Warm temperatures and high humidity.",
            "Keep the block clean, and feed, water and prune well. Check for it often. Sources rely on fungicide: ask an agronomist.",
            ("plantvillage", "tnau", "nvwa", "paluma"), "rust"),
    Disease("leaf_spot", "Cercospora leaf spot", "Fungus (Cercospora, Pseudocercospora)",
            "Smoky dark brown patches on the upper leaf with a darker border, which join into large dead areas. Grey felty tufts in high humidity.",
            "Lesions on fruit, which can crack it and let other rots in.",
            "Algal leaf spot has raised orange tufts. These are flat and brown.", "Wet weather at 13-25 °C. Warm, humid, rainy areas.",
            "Prune the canopy and remove infected leaves. Sources say copper sprays work best: confirm with an agronomist.",
            ("growables", "plantvillage")),
    Disease("scab", "Fruit scab", "Fungus (Pestalotiopsis)",
            "Rarely on leaves.", "Corky, round to oval spots on green fruit, which sink with age and can reach the flesh.",
            "Anthracnose is on mature fruit. Insect feeding can leave scab-like marks: check for pests first.", None,
            "Remove affected fruit. Ask an agronomist before spraying.", ("florida", "agrifarming")),
    Disease("black_mold", "Black mould on fruit", "Not described in the sources read",
            None, "Black mould growth on the fruit. Sooty mould, by contrast, is a sticky black film that follows sap-sucking insects.",
            "Sooty mould wipes off, and comes with mealybugs or scale nearby.", None,
            "Remove affected fruit. Look for insects if the film is sticky.", ("bd_guava", "agrifarming"), thin=True),
    Disease("mealybug", "Mealybug and scale", "Sap-sucking insects",
            "White waxy clusters, or green or grey flat scales on leaves and twigs. Sticky leaves with black sooty mould. Ants nearby.",
            "Clusters at the fruit stalk. Leaves or fruit may drop.", "The white clusters or flat scales are the sign: look under the leaves.", "Several generations a year.",
            "Collect and burn fallen material. Horticultural oil and natural enemies are the organic options.",
            ("plantvillage", "agrifarming"), "fruit_fly"),
    Disease("insect_damage", "Insect feeding damage", "Insects, including thrips",
            "Holes or chewed edges. With thrips: silvery, finely stippled, distorted leaves speckled with black droppings.",
            None, "Holes with clean edges are insect damage. Disease spots stay as spots.", "Thrips breed year round in the tropics.",
            "Find the insect before treating. Do not plant beside onions, garlic or cereals, where thrips build up.", ("plantvillage",)),
    Disease("fruit_fly", "Fruit fly and guava weevil", "Insects",
            None, "Dented fruit with dark puncture wounds, soft mushy areas, larvae inside, early drop. Weevil: hardened fruit that ripens early.",
            "Puncture wounds with soft flesh under them point to larvae, not a surface spot.", "Warm, humid weather.",
            "Bag fruit at 3-4 cm. Remove and destroy infested fruit. Pheromone traps. Plough around the tree base to expose pupae.",
            ("plantvillage", "guava_doc"), "fruit_fly"),
    Disease("chlorosis", "Yellow leaves from feed or soil", "Nutrient shortage or soil, not a germ",
            "Magnesium: yellow, bronze or reddish between veins that stay green, on the oldest leaves first; new growth stays green until it is severe. Iron: yellowish-white young leaves. Too little feed: general yellowing.",
            None, "Colour between the veins, on old leaves, with clean new growth points to feed or soil, not a germ. A soil pH problem can look the same: test first. Withheld water at the stress stage also yellows leaves on purpose.",
            "Acid soil or heavy potassium or calcium feeding (magnesium). Alkaline soil locks up iron and zinc.",
            "Check the soil readings and take a leaf test. No fungicide for this alone.", ("vikaspedia", "taiwan", "guava_doc"), "chlorosis"),
    Disease("scorch", "Leaf scorch", "Often potassium shortage",
            "Brown dead edges of the leaf, older leaves first, spreading between the veins.", None,
            "Scorch follows the leaf edge. Disease spots are scattered across the leaf.", None,
            "Check feed and water, and take a leaf test.", ("vikaspedia", "taiwan")),
    Disease("cracking", "Fruit cracking", "Water and nutrition",
            None, "Splits running along or across ripening fruit.", "Cercospora on fruit also cracks it: look for brown lesions first.",
            "A sudden jump in water after a dry spell, or high pH locking up boron and calcium.",
            "Keep moisture steady with short drip pulses. Boron and calcium sprays: confirm with an agronomist.", ("guava_doc",), "cracking"),
    Disease("guava_decline", "Wilt, decline and root nematodes", "Soil fungus and nematodes",
            "Whole tree or branch: pale yellow, drooping leaves, stunting, dieback, early leaf drop.", "Early fruit drop.",
            "A photo cannot show the roots. Dig up feeder roots and look for galls before deciding.",
            "Shows with the start of the rains. Sandy soil suits nematodes. Wet, acid soil speeds wilt.",
            "Do not over-water. Mulch, and feed well. Dig up roots to check for galls.", ("gardening", "growables", "plantvillage", "guava_doc"), "guava_decline"),
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
