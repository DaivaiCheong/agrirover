import type { PlantSoilRow, SoilTargets } from "./soil";

export type TomatoConditionId =
  | "early_blight"
  | "leaf_curl"
  | "yellow_leaves"
  | "blossom_end_rot"
  | "pest_damage";

export type CareStep = {
  step: 1 | 2 | 3 | 4;
  label: string;
  action: string;
};

export type TomatoTreatment = {
  id: TomatoConditionId;
  title: string;
  shortLabel: string;
  severityHint: string;
  symptoms: string;
  causes: string;
  steps: [CareStep, CareStep, CareStep, CareStep];
  prevention: string;
};

export type PlantCarePlan = {
  conditionId: TomatoConditionId | "soil_stress";
  guideId: TomatoConditionId;
  title: string;
  diagnosisNote: string;
  steps: [CareStep, CareStep, CareStep, CareStep];
};

const s1 = (action: string, label = "Immediate Field Action (Today)"): CareStep => ({ step: 1, label, action });
const s2 = (action: string, label = "Soil / Irrigation Adjustment"): CareStep => ({ step: 2, label, action });
const s3 = (action: string, label = "Targeted Treatment Method (Organic & Standard Options)"): CareStep => ({
  step: 3,
  label,
  action,
});
const s4 = (action: string, label = "Follow-Up Check"): CareStep => ({ step: 4, label, action });

export const TOMATO_TREATMENTS: TomatoTreatment[] = [
  {
    id: "early_blight",
    title: "Early blight",
    shortLabel: "Early blight",
    severityHint: "Fungal leaf spot",
    symptoms:
      "Dark brown target-ring spots on older lower leaves with yellow halos; lesions slowly spread upward along the stem.",
    causes: "Alternaria fungus spread by warm humidity and soil splash onto lower foliage during watering or rain.",
    steps: [
      s1(
        "Prune all spotted lower leaves cleanly at the stem up to 20–30 cm above the bed using alcohol-wiped shears; bag and remove clippings (never compost).",
      ),
      s2(
        "Water strictly at the drip line in early morning to keep moisture inside the target band without wetting leaves, and place 5 cm of dry straw mulch around the stem base.",
      ),
      s3(
        "Organic option: spray Bacillus subtilis bio-fungicide (5–10 g/L water) or wettable sulfur (3 g/L). Standard option: apply copper hydroxide (2–3 g/L water). Spray evenly every 7 days in early morning or late afternoon below 30 °C.",
      ),
      s4(
        "Check the next AgriRover morning scan in 48–72 hours to verify no new target-ring spots appear above the pruned stem height.",
      ),
    ],
    prevention:
      "Water at the drip line early in the morning, rotate tomato beds each season, and keep lower stems pruned 20–30 cm above soil.",
  },
  {
    id: "leaf_curl",
    title: "Leaf curl",
    shortLabel: "Leaf curl",
    severityHint: "Moisture stress or TYLCV",
    symptoms: "Upper leaves cup or roll upward, feel leathery, and growth slows at the shoot tips.",
    causes:
      "Rapid soil moisture drops, high midday heat stress, high root-zone EC, or whitefly-transmitted Tomato Yellow Leaf Curl Virus (TYLCV).",
    steps: [
      s1(
        "Check the undersides of curled upper shoots for tiny whiteflies and hang 30–40% shade net if leaves feel hot or brittle in midday sun; isolate any severely stunted viral plants.",
      ),
      s2(
        "Run a steady 2.0–2.5 L pulse drip irrigation cycle at the plant base to hold Soil Moisture inside target (58–72%) and top up 4–5 cm organic mulch to cool feeder roots.",
      ),
      s3(
        "Organic option: hang 1–2 yellow sticky traps per 3 m row and spray cold-pressed neem oil (5 mL/L water + 2 mL mild soap). Standard option: apply insecticidal soap or approved pyrethrin in early morning or dusk below 30 °C.",
      ),
      s4(
        "Check the next AgriRover morning scan in 24–48 hours to confirm soil moisture holds steady and new shoot tips unroll normally.",
      ),
    ],
    prevention:
      "Use fine insect netting in greenhouse/nursery beds, keep weeds clear around borders, and keep soil moisture steady.",
  },
  {
    id: "yellow_leaves",
    title: "Yellow leaves (N deficiency)",
    shortLabel: "Yellow leaves (N deficiency)",
    severityHint: "Nutrient uptake or N shortage",
    symptoms: "Older lower leaves turn pale green to uniform yellow while young shoot tips stay greener.",
    causes:
      "Low available soil nitrogen (< 80 mg/kg), waterlogged or acidic roots blocking uptake, or natural lower-canopy aging when fruit load builds.",
    steps: [
      s1(
        "Prune the 2–3 heavily yellowed older lower leaves cleanly at the stem with sanitized shears and remove them from the bed so energy stays in fruiting clusters.",
      ),
      s2(
        "Confirm live Soil Moisture (target 58–72%) and Soil pH (target 6.0–6.8) first—drain saturated soil or buffer irrigation water pH before adding any soil fertilizer.",
      ),
      s3(
        "If soil N is below 80 mg/kg: drench 1.5–2 L fish emulsion (15 mL/L water) or side-dress 15–20 g balanced NPK 12-12-17 per plant watered in thoroughly. If soil N is already >= 80 mg/kg, skip heavy granular N and use a light foliar seaweed spray (5 mL/L) early morning or late afternoon below 30 °C.",
      ),
      s4(
        "Check the next AgriRover morning scan in 48–72 hours to confirm yellowing has stopped spreading upward and EC stays within 0.8–2.5 mS/cm.",
      ),
    ],
    prevention:
      "Split nitrogen feeds across vegetative and early flowering stages and maintain organic mulch to stabilize root-zone fertility.",
  },
  {
    id: "blossom_end_rot",
    title: "Blossom-end rot",
    shortLabel: "Blossom-end rot",
    severityHint: "Calcium transport disorder",
    symptoms:
      "Water-soaked, dark sunken leathery patches on the blossom (bottom) end of developing green or ripening tomatoes.",
    causes:
      "Localized calcium shortage in developing fruit triggered by uneven wet-dry watering swings, acidic pH (< 6.0), or high EC salt spikes.",
    steps: [
      s1(
        "Snap off fruits showing dark sunken blossom-end patches immediately (damaged fruit will not recover) so the plant shifts calcium to healthy swelling fruit clusters.",
      ),
      s2(
        "Stabilize drip watering to avoid wet-dry swings, mulch 5 cm around the base, and lift acidic soil pH toward 6.2–6.8 with 50–80 g/m² agricultural limestone if soil pH is below 6.0.",
      ),
      s3(
        "Foliar Calcium boost: spray chelated calcium or calcium chloride solution (3–4 mL/L water) directly onto young developing fruit clusters in early morning or late afternoon (never in midday heat above 30 °C).",
      ),
      s4(
        "Review AgriRover pH and camera scans over the next 5–7 days to confirm newly set marble-sized fruits remain clean at the blossom end.",
      ),
    ],
    prevention:
      "Maintain consistent drip irrigation schedule during rapid fruit sizing and confirm soil pH stays in 6.0–6.8 before fruit set.",
  },
  {
    id: "pest_damage",
    title: "Pest damage — Leafminer / Whitefly",
    shortLabel: "Pest damage",
    severityHint: "Insect pressure",
    symptoms:
      "Winding pale squiggly tunnels inside leaves (leafminers) or tiny white insects and sticky honeydew under upper leaves (whiteflies).",
    causes: "Warm dry spells, nearby host weeds, or excess soft nitrogen flush attracting leafminer flies and sap-sucking whiteflies.",
    steps: [
      s1(
        "Pinch off and bag heavily mined leaves cleanly (gently crushing visible larvae at the end of leaf tunnels) and clear host weeds along the bed border.",
      ),
      s2(
        "Hold steady drip moisture (58–72%) to avoid drought stress and pause high-nitrogen feeds if soil N exceeds 120 mg/kg so plants do not push overly soft sap-rich shoots.",
      ),
      s3(
        "Hang 1 yellow sticky card per 2–3 m at canopy height. Organic/Targeted spray: apply spinosad (1–2 mL/L water for leafminers) or cold-pressed neem oil + insecticidal soap (5 mL/L water for whiteflies), coating leaf undersides early morning or dusk below 30 °C.",
      ),
      s4(
        "Check the next AgriRover morning scan in 48–72 hours to verify newly unfurled upper leaves stay free of fresh pale tunnels or whitefly honeydew.",
      ),
    ],
    prevention:
      "Remove crop debris promptly after harvest and avoid planting next to infested cucurbits or older solanaceous beds.",
  },
];

const TREATMENT_BY_ID = new Map(TOMATO_TREATMENTS.map((t) => [t.id, t]));

export function matchTreatmentForCondition(codeOrCondition: string | null | undefined): TomatoTreatment | null {
  if (!codeOrCondition) return null;
  const text = codeOrCondition.toLowerCase();
  if (text.includes("blight") || text.includes("spot")) return TREATMENT_BY_ID.get("early_blight") ?? null;
  if (text.includes("curl")) return TREATMENT_BY_ID.get("leaf_curl") ?? null;
  if (text.includes("blossom")) return TREATMENT_BY_ID.get("blossom_end_rot") ?? null;
  if (text.includes("pest") || text.includes("miner") || text.includes("whitefly") || text.includes("insect") || text.includes("mealybug")) {
    return TREATMENT_BY_ID.get("pest_damage") ?? null;
  }
  if (text.includes("yellow") || text.includes("chlorosis") || text.includes("nitrogen") || text.includes("deficiency")) {
    return TREATMENT_BY_ID.get("yellow_leaves") ?? null;
  }
  return null;
}

const LIVE_S2_LABEL = "Soil / Irrigation Adjustment (Based on Live Probe)";

function fmtVal(v: number | null, digits: number, unit = ""): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  return `${v.toFixed(digits)}${unit}`;
}

function buildYellowPlan(plant: PlantSoilRow, targets: SoilTargets, base: TomatoTreatment): PlantCarePlan {
  const r = plant.readings;
  const phStr = fmtVal(r.ph, 2);
  const moistStr = fmtVal(r.moisture, 1, "%");
  const ecStr = fmtVal(r.ec, 2, " mS/cm");
  const nStr = r.n !== null ? `${Math.round(r.n)} mg/kg` : null;

  const moistHigh = r.moisture !== null && r.moisture > targets.moisture[1];
  const moistLow = r.moisture !== null && r.moisture < targets.moisture[0];
  const phBad = r.ph !== null && (r.ph < targets.ph[0] || r.ph > targets.ph[1]);
  const ecHigh = r.ec !== null && r.ec > targets.ec[1];
  const nLow = r.n !== null && r.n < 80;

  if (moistHigh) {
    return {
      conditionId: "yellow_leaves",
      guideId: "yellow_leaves",
      title: base.title,
      diagnosisNote: `Moisture is high at ${moistStr} (above ${targets.moisture[1]}% target)—root oxygen is restricted, blocking nitrogen uptake${nStr ? ` even with Soil N at ${nStr}` : ""}. Fix drainage before adding fertilizer.`,
      steps: [
        s1(
          "Prune the 2–3 heavily yellowed older lower leaves cleanly at the stem with sanitized shears and gently fork/loosen crusted bed edges to let oxygen back into the root zone.",
        ),
        s2(
          `Pause drip irrigation for 24–48 hours until probe Moisture drops from ${moistStr} back into ${targets.moisture[0]}–${targets.moisture[1]}% (${ecStr ? `currently EC ${ecStr}` : "monitor EC"}). Hold granular soil nitrogen until drainage recovers.`,
          LIVE_S2_LABEL,
        ),
        base.steps[2],
        s4(
          `Check the next AgriRover morning scan in 48–72 hours to verify Moisture re-enters ${targets.moisture[0]}–${targets.moisture[1]}% and yellowing stops climbing.`,
        ),
      ],
    };
  }

  if (phBad) {
    const dir = (r.ph ?? 6.4) < targets.ph[0] ? "acidic" : "alkaline";
    const adjust =
      (r.ph ?? 6.4) < targets.ph[0]
        ? `Side-dress agricultural lime or dolomite (40–60 g/m²) gently into the top 5 cm around the root zone to raise Soil pH from ${phStr} into ${targets.ph[0]}–${targets.ph[1]}.`
        : `Drench with pH-buffered water (target 6.2–6.4) and organic compost mulch to bring Soil pH from ${phStr} back into ${targets.ph[0]}–${targets.ph[1]}.`;
    return {
      conditionId: "yellow_leaves",
      guideId: "yellow_leaves",
      title: base.title,
      diagnosisNote: `Soil pH is ${dir} at ${phStr} (outside ${targets.ph[0]}–${targets.ph[1]} target)${nStr ? ` while Soil N is ${nStr}` : ""}${moistStr ? ` and Moisture is ${moistStr}` : ""}—off-range pH is locking up nitrogen availability at the roots.`,
      steps: [
        s1(
          `Prune the 2–3 yellowing lower leaves cleanly at the stem with sanitized shears and clear surface salt/crust around the drip emitter.`,
        ),
        s2(`${adjust} Keep Moisture steady near ${moistStr ?? `${targets.moisture[0]}–${targets.moisture[1]}%`}.`, LIVE_S2_LABEL),
        s3(
          "While soil pH shifts over 3–5 days, give 1 light foliar seaweed + trace-element spray (5 mL/L water) early morning or late afternoon (below 30 °C) so leaves absorb nutrients directly.",
        ),
        s4(
          `Check the next AgriRover probe scan in 48–72 hours to confirm Soil pH moves toward ${targets.ph[0]}–${targets.ph[1]} and mid-canopy foliage stays green.`,
        ),
      ],
    };
  }

  if (ecHigh) {
    return {
      conditionId: "yellow_leaves",
      guideId: "yellow_leaves",
      title: base.title,
      diagnosisNote: `Soil EC is elevated at ${ecStr} (above ${targets.ec[1]} mS/cm target)${nStr ? ` with Soil N at ${nStr}` : ""}—root-zone salt buildup is restricting water and nitrogen uptake.`,
      steps: [
        s1(
          "Prune the 2–3 yellow older lower leaves cleanly at the stem using sanitized shears so transpiration pressure drops while salts are cleared.",
        ),
        s2(
          `Run a slow 3.0 L clean-water drip leach to pull Soil EC from ${ecStr} down into ${targets.ec[0]}–${targets.ec[1]} mS/cm while holding Moisture within ${targets.moisture[0]}–${targets.moisture[1]}%.`,
          LIVE_S2_LABEL,
        ),
        s3(
          "Skip all soil fertilizers until EC falls below target; if foliage remains pale after leaching, apply 1 light foliar seaweed extract spray (5 mL/L) early morning or late afternoon below 30 °C.",
        ),
        s4(
          `Check the next AgriRover morning scan in 48–72 hours to verify EC drops inside ${targets.ec[0]}–${targets.ec[1]} mS/cm and new upper growth recovers.`,
        ),
      ],
    };
  }

  if (nLow) {
    return {
      conditionId: "yellow_leaves",
      guideId: "yellow_leaves",
      title: base.title,
      diagnosisNote: `Live probe confirms low Soil Nitrogen (${nStr}, below 80 mg/kg)${phStr ? ` with pH ${phStr}` : ""}${moistStr ? ` and Moisture ${moistStr}` : ""}—true soil nitrogen deficiency is causing uniform lower-leaf yellowing.`,
      steps: [
        s1(
          "Prune the 2–3 heavily yellowed older lower leaves cleanly at the stem using sanitized shears and remove them from the bed.",
        ),
        s2(
          `${moistLow ? `Lift Moisture from ${moistStr} into ${targets.moisture[0]}–${targets.moisture[1]}% first, then hold` : `Maintain steady Moisture near ${moistStr ?? `${targets.moisture[0]}–${targets.moisture[1]}%`}`} and pH at ${phStr ?? `${targets.ph[0]}–${targets.ph[1]}`} so roots absorb the upcoming feed cleanly (${ecStr ? `EC currently ${ecStr}` : `target EC ${targets.ec[0]}–${targets.ec[1]}`}).`,
          LIVE_S2_LABEL,
        ),
        s3(
          "Organic option: drench 1.5–2 L fish emulsion (15 mL/L water) or aerated compost tea at the root zone. Standard option: side-dress 15–20 g calcium nitrate or balanced NPK 12-12-17 per plant watered in thoroughly during early morning or late afternoon (avoid midday above 30 °C).",
        ),
        s4(
          `Check the next AgriRover morning scan in 48–72 hours to confirm EC stays inside ${targets.ec[0]}–${targets.ec[1]} mS/cm and yellowing stops spreading.`,
        ),
      ],
    };
  }

  return {
    conditionId: "yellow_leaves",
    guideId: "yellow_leaves",
    title: base.title,
    diagnosisNote: `Live probe shows ${nStr ? `Soil Nitrogen (${nStr}), ` : ""}pH (${phStr ?? "in range"}), and Moisture (${moistStr ?? "in range"}) are already in range—yellowing on lower leaves is likely natural lower-canopy aging or mild root-zone uptake lag rather than lack of soil nitrogen. Avoid over-applying heavy nitrogen.`,
    steps: [
      s1(
        "Prune the 2–3 yellowing lower leaves cleanly at the stem with sanitized shears and remove them from the bed.",
      ),
      s2(
        `${moistLow ? `Raise drip slightly from ${moistStr} into ${targets.moisture[0]}–${targets.moisture[1]}%` : `Keep drip irrigation at the current schedule to hold Moisture near ${moistStr ?? `${targets.moisture[0]}–${targets.moisture[1]}%`}`}${ecStr ? ` and EC steady at ${ecStr}` : ""}; skip heavy soil nitrogen${nStr ? ` since soil N is already ${nStr}` : ""}.`,
        LIVE_S2_LABEL,
      ),
      s3(
        "If an uptake boost is needed, apply a light foliar seaweed extract or strained compost-tea spray (5 mL/L water) rather than heavy soil nitrogen. Apply early morning or late afternoon; avoid spraying in midday heat above 30 °C.",
      ),
      s4(
        "Check the next AgriRover morning scan in 48–72 hours to confirm yellowing has stopped spreading upward to fruiting trusses.",
      ),
    ],
  };
}

function buildLeafCurlPlan(plant: PlantSoilRow, targets: SoilTargets, base: TomatoTreatment): PlantCarePlan {
  const r = plant.readings;
  const phStr = fmtVal(r.ph, 2);
  const moistStr = fmtVal(r.moisture, 1, "%");
  const ecStr = fmtVal(r.ec, 2, " mS/cm");
  const tempStr = fmtVal(r.soilTemp, 1, " °C");

  const moistLow = r.moisture !== null && r.moisture < targets.moisture[0];
  const ecHigh = r.ec !== null && r.ec > targets.ec[1];
  const tempHigh = r.soilTemp !== null && r.soilTemp > targets.soilTemp[1];

  const note = moistLow
    ? `Live probe shows low Soil Moisture at ${moistStr} (below ${targets.moisture[0]}–${targets.moisture[1]}% target)${ecStr ? `, EC ${ecStr}` : ""}${phStr ? `, and pH ${phStr}` : ""}. Dry root stress is driving upward leaf curl; confirm whether whiteflies are also present.`
    : ecHigh
      ? `Live probe shows high Soil EC at ${ecStr} (above ${targets.ec[1]} mS/cm target) with Moisture ${moistStr ?? "—"} and pH ${phStr ?? "—"}—root-zone salt stress restricts water uptake and triggers leaf rolling.`
      : tempHigh
        ? `Live probe records elevated Soil Temp at ${tempStr} (above ${targets.soilTemp[1]} °C) with Moisture ${moistStr ?? "—"}—root-zone heat stress is triggering protective leaf curl.`
        : `Live probe shows Moisture (${moistStr ?? "—"}), Soil Temp (${tempStr ?? "—"}), and pH (${phStr ?? "—"}) are inside target—check closely for whitefly-transmitted Tomato Yellow Leaf Curl Virus (TYLCV) or midday heat spike.`;

  return {
    conditionId: "leaf_curl",
    guideId: "leaf_curl",
    title: base.title,
    diagnosisNote: note,
    steps: [
      s1(
        "Inspect curled upper leaf undersides for whiteflies and erect light 30–40% shade cloth over the bed if afternoon leaf temperatures spike; tag or isolate any plants showing severe stunted TYLCV mosaic.",
      ),
      s2(
        moistLow
          ? `Immediately apply a 2.0–2.5 L pulse drip cycle to lift Soil Moisture from ${moistStr} back into ${targets.moisture[0]}–${targets.moisture[1]}%, then top up 4–5 cm organic straw mulch to stabilize moisture and Soil Temp (${tempStr ?? "in range"}).`
          : ecHigh
            ? `Flush slowly with 3.0 L clean drip water to bring Soil EC down from ${ecStr} into ${targets.ec[0]}–${targets.ec[1]} mS/cm while keeping Moisture near ${moistStr ?? `${targets.moisture[0]}–${targets.moisture[1]}%`}.`
            : `Keep drip schedule steady to maintain Moisture near ${moistStr ?? `${targets.moisture[0]}–${targets.moisture[1]}%`} (pH ${phStr ?? "in range"}) and add 5 cm dry mulch to buffer Soil Temp (currently ${tempStr ?? "within target"}).`,
        LIVE_S2_LABEL,
      ),
      base.steps[2],
      s4(
        `Check the next AgriRover scan in 24–48 hours to confirm Moisture remains above ${targets.moisture[0]}% and new shoot tips uncurl without viral yellowing.`,
      ),
    ],
  };
}

function buildEarlyBlightPlan(plant: PlantSoilRow, targets: SoilTargets, base: TomatoTreatment): PlantCarePlan {
  const r = plant.readings;
  const phStr = fmtVal(r.ph, 2);
  const moistStr = fmtVal(r.moisture, 1, "%");
  const tempStr = fmtVal(r.soilTemp, 1, " °C");
  const nStr = r.n !== null ? `${Math.round(r.n)} mg/kg` : null;
  const moistHigh = r.moisture !== null && r.moisture >= targets.moisture[1];
  const nLow = r.n !== null && r.n < 80;

  const note = moistHigh
    ? `Live probe reads high Soil Moisture at ${moistStr} (Soil Temp ${tempStr ?? "—"}, pH ${phStr ?? "—"})—damp topsoil splashes Alternaria spores onto lower tomato leaves.`
    : `Live probe reads Moisture ${moistStr ?? "—"}, Soil Temp ${tempStr ?? "—"}, and pH ${phStr ?? "—"}${nStr ? ` (Soil N ${nStr}${nLow ? " — low vigor increases blight susceptibility" : ""})` : ""}. Early blight spreads from lower soil splash in warm microclimates.`;

  return {
    conditionId: "early_blight",
    guideId: "early_blight",
    title: base.title,
    diagnosisNote: note,
    steps: [
      base.steps[0],
      s2(
        moistHigh
          ? `Trim drip run time slightly to pull Moisture down from ${moistStr} into ${targets.moisture[0]}–${targets.moisture[1]}% and spread 5 cm dry straw mulch so drops cannot splash spores onto stems.`
          : `Water strictly at the drip line early in the morning to hold Moisture steady near ${moistStr ?? `${targets.moisture[0]}–${targets.moisture[1]}%`} (pH ${phStr ?? "—"}) without wetting foliage, and add 5 cm clean mulch.${nLow ? ` Follow with a gentle fish-emulsion root drench (10 mL/L) since Soil N is ${nStr}.` : ""}`,
        LIVE_S2_LABEL,
      ),
      base.steps[2],
      base.steps[3],
    ],
  };
}

function buildBlossomEndRotPlan(plant: PlantSoilRow, targets: SoilTargets, base: TomatoTreatment): PlantCarePlan {
  const r = plant.readings;
  const phStr = fmtVal(r.ph, 2);
  const moistStr = fmtVal(r.moisture, 1, "%");
  const ecStr = fmtVal(r.ec, 2, " mS/cm");

  const phLow = r.ph !== null && r.ph < targets.ph[0];
  const phHigh = r.ph !== null && r.ph > targets.ph[1];
  const moistLow = r.moisture !== null && r.moisture < targets.moisture[0];
  const ecHigh = r.ec !== null && r.ec > targets.ec[1];

  const note = phLow
    ? `Live probe shows acidic Soil pH at ${phStr} (below ${targets.ph[0]}–${targets.ph[1]} target) with Moisture ${moistStr ?? "—"} and EC ${ecStr ?? "—"}—low soil pH limits root calcium absorption during rapid fruit sizing.`
    : phHigh
      ? `Live probe shows high Soil pH at ${phStr} (above ${targets.ph[1]}) with Moisture ${moistStr ?? "—"}—alkaline soil precipitates calcium out of root uptake.`
      : ecHigh || moistLow
        ? `Live probe reads ${moistLow ? `low Moisture (${moistStr})` : `elevated EC (${ecStr})`} (pH ${phStr ?? "—"})—uneven water uptake or high soluble salts restrict calcium flow into swelling fruit.`
        : `Live probe reads Soil pH ${phStr ?? "—"}, Moisture ${moistStr ?? "—"}, and EC ${ecStr ?? "—"} inside target—rapid fruit bulking is briefly outpacing calcium delivery to distal fruit tissue.`;

  return {
    conditionId: "blossom_end_rot",
    guideId: "blossom_end_rot",
    title: base.title,
    diagnosisNote: note,
    steps: [
      base.steps[0],
      s2(
        phLow
          ? `Incorporate 50–80 g/m² fast-acting agricultural or dolomitic limestone gently into the moist root zone to lift pH from ${phStr} into 6.2–6.8, and hold steady drip Moisture (${moistStr ?? `${targets.moisture[0]}–${targets.moisture[1]}%`}) while keeping EC (${ecStr ?? "—"}) below ${targets.ec[1]} mS/cm.`
          : moistLow
            ? `Restore smooth pulse drip watering to lift Moisture from ${moistStr} into ${targets.moisture[0]}–${targets.moisture[1]}% with 5 cm straw mulch so calcium moves continuously in transpiration water (pH ${phStr ?? "—"}, EC ${ecStr ?? "—"}).`
            : `Maintain consistent twice-daily pulse drip to hold Moisture near ${moistStr ?? `${targets.moisture[0]}–${targets.moisture[1]}%`} and Soil pH at ${phStr ?? "6.2–6.8"} without high-ammonium N spikes (keep EC ${ecStr ?? "—"} below ${targets.ec[1]} mS/cm).`,
        LIVE_S2_LABEL,
      ),
      base.steps[2],
      base.steps[3],
    ],
  };
}

function buildPestPlan(plant: PlantSoilRow, targets: SoilTargets, base: TomatoTreatment): PlantCarePlan {
  const r = plant.readings;
  const phStr = fmtVal(r.ph, 2);
  const moistStr = fmtVal(r.moisture, 1, "%");
  const tempStr = fmtVal(r.soilTemp, 1, " °C");
  const ecStr = fmtVal(r.ec, 2, " mS/cm");
  const nStr = r.n !== null ? `${Math.round(r.n)} mg/kg` : null;
  const nHigh = r.n !== null && r.n >= 120;

  const note = `Live probe reads Soil Temp ${tempStr ?? "—"}, Moisture ${moistStr ?? "—"}, pH ${phStr ?? "—"}, and EC ${ecStr ?? "—"}${nStr ? ` (Soil N ${nStr})` : ""}. ${
    nHigh
      ? `Elevated Soil N (${nStr}) produces tender flush growth favored by leafminers and whiteflies.`
      : "Root-zone metrics are steady; focus on breaking pest cycles in the upper canopy."
  }`;

  return {
    conditionId: "pest_damage",
    guideId: "pest_damage",
    title: base.title,
    diagnosisNote: note,
    steps: [
      base.steps[0],
      s2(
        `Keep Moisture steady near ${moistStr ?? `${targets.moisture[0]}–${targets.moisture[1]}%`} (pH ${phStr ?? "—"}, EC ${ecStr ?? "—"}) to minimize plant stress${
          nHigh ? `, and hold extra nitrogen applications while Soil N is ${nStr}` : ""
        }.`,
        LIVE_S2_LABEL,
      ),
      base.steps[2],
      base.steps[3],
    ],
  };
}

function buildSoilStressPlan(plant: PlantSoilRow, targets: SoilTargets): PlantCarePlan | null {
  if (plant.status !== "attention") return null;
  const r = plant.readings;
  const phStr = fmtVal(r.ph, 2);
  const moistStr = fmtVal(r.moisture, 1, "%");
  const ecStr = fmtVal(r.ec, 2, " mS/cm");
  const tempStr = fmtVal(r.soilTemp, 1, " °C");

  const guideId: TomatoConditionId =
    plant.states.ph === "low" || plant.states.ph === "high" || plant.states.ec === "high"
      ? "blossom_end_rot"
      : "leaf_curl";

  return {
    conditionId: "soil_stress",
    guideId,
    title: "Preventive soil & irrigation care",
    diagnosisNote: `Foliage scan looks healthy (${plant.vision.badgeLabel}), but live probe flagged ${plant.issues.join(" · ")} (Moisture ${moistStr ?? "—"}, pH ${phStr ?? "—"}, EC ${ecStr ?? "—"}, Temp ${tempStr ?? "—"}).`,
    steps: [
      s1(
        "Check drip emitters around this plant for clogs or leaks today so uneven moisture does not stress fruiting trusses.",
      ),
      s2(
        plant.states.moisture === "low"
          ? `Apply a gentle 2.0 L drip irrigation pulse to raise Soil Moisture from ${moistStr} into the ${targets.moisture[0]}–${targets.moisture[1]}% target band, and verify mulch depth (4–5 cm).`
          : plant.states.ph === "low" || plant.states.ph === "high"
            ? `Buffer irrigation water toward pH 6.2–6.5 to guide Soil pH from ${phStr} back into ${targets.ph[0]}–${targets.ph[1]} while keeping Moisture near ${moistStr ?? "target"}.`
            : `Hold current drip cycle and adjust fertility/drainage so Soil Moisture stays in ${targets.moisture[0]}–${targets.moisture[1]}% and EC in ${targets.ec[0]}–${targets.ec[1]} mS/cm.`,
        LIVE_S2_LABEL,
      ),
      s3(
        "No chemical spray is needed because foliage shows no lesions or pest trails; optionally apply a light preventive kelp/humic root drench (5 mL/L water) during normal morning drip.",
      ),
      s4(
        "Review tomorrow morning's AgriRover probe reading to verify soil metrics return inside target bands before visual stress appears.",
      ),
    ],
  };
}

/** Generate live-telemetry-aware 4-step care guidance for any inspected plant. */
export function buildPlantCarePlan(plant: PlantSoilRow, targets: SoilTargets): PlantCarePlan | null {
  const v = plant.vision;
  if (v.status === "none" || v.status === "unrecorded") return null;

  const base = v.status === "alert" ? matchTreatmentForCondition(v.condition || v.shortLabel) : null;
  if (!base) return buildSoilStressPlan(plant, targets);

  switch (base.id) {
    case "yellow_leaves":
      return buildYellowPlan(plant, targets, base);
    case "leaf_curl":
      return buildLeafCurlPlan(plant, targets, base);
    case "early_blight":
      return buildEarlyBlightPlan(plant, targets, base);
    case "blossom_end_rot":
      return buildBlossomEndRotPlan(plant, targets, base);
    case "pest_damage":
      return buildPestPlan(plant, targets, base);
  }
}
