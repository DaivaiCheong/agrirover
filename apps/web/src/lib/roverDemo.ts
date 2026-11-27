import type {
  Advice,
  Asset,
  BedConditions,
  CondAlert,
  CostEntry,
  Cycle,
  DeviceRow,
  Harvest,
  RoverCell,
  Sale,
  Schedule,
  ScheduleEvent,
  Settings,
  StockItem,
  SurveySummary,
  TelemetrySeries,
  ZoneNow,
} from "./api";

export type DemoRoundDetail = SurveySummary & { cells: RoverCell[] };

type DemoAttentionReason = "yellow" | "curl" | "blight" | "blossom" | "pest" | "dry" | "ph";

type DemoBlockSpec = {
  zone: string;
  label: string;
  areaM2: number;
  rows: number;
  cols: number;
  rowM: number;
  treeM: number;
  day: number;
  variety: string;
  setup: string;
  setupLabel: string;
  stageN: number;
  stageTitle: string;
  moistureBand: [number, number];
  ecBand: [number, number];
  basePh: number;
  baseMoisture: number;
  baseEc: number;
  baseSoilTemp: number;
  npk: [number, number, number];
  attentionCells: { row: number; col: number; reason: DemoAttentionReason; ph?: number; moisture?: number; ec?: number; nitrogen?: number }[];
  emptyCells?: [number, number][];
};

const SPECS: DemoBlockSpec[] = [
  {
    zone: "g1",
    label: "G1 Greenhouse North",
    areaM2: 400,
    rows: 4,
    cols: 4,
    rowM: 5,
    treeM: 5,
    day: 32,
    variety: "Roma Tomato",
    setup: "greenhouse_a",
    setupLabel: "Greenhouse Trellis Beds",
    stageN: 2,
    stageTitle: "Flowering & early fruit set",
    moistureBand: [58, 72],
    ecBand: [0.8, 2.5],
    basePh: 6.4,
    baseMoisture: 64.5,
    baseEc: 1.45,
    baseSoilTemp: 23.8,
    npk: [110, 75, 185],
    attentionCells: [
      { row: 1, col: 1, reason: "yellow" },   // R2 T2: Yellow leaves (N deficiency) · 91%
      { row: 2, col: 1, reason: "blight" },   // R3 T2: Early blight · 85%
    ],
    emptyCells: [[3, 3]],
  },
  {
    zone: "g2",
    label: "G2 Commercial Bed A",
    areaM2: 105,
    rows: 2,
    cols: 5,
    rowM: 3,
    treeM: 3.5,
    day: 48,
    variety: "Cherry Belle",
    setup: "commercial",
    setupLabel: "Drip Row Commercial",
    stageN: 2,
    stageTitle: "Flowering & early fruit set",
    moistureBand: [58, 72],
    ecBand: [0.8, 2.5],
    basePh: 6.35,
    baseMoisture: 65.0,
    baseEc: 1.5,
    baseSoilTemp: 24.4,
    npk: [125, 80, 190],
    attentionCells: [
      { row: 0, col: 4, reason: "curl", moisture: 54.2, ec: 1.25 }, // R1 T5: Leaf curl · 88% (54.2% moisture)
      { row: 1, col: 1, reason: "yellow", nitrogen: 64 },             // R2 T2: Yellow leaves · true low soil N (64 mg/kg)
    ],
  },
  {
    zone: "g3",
    label: "G3 Raised Beds B",
    areaM2: 60,
    rows: 2,
    cols: 5,
    rowM: 3,
    treeM: 2,
    day: 64,
    variety: "San Marzano",
    setup: "raised_bed",
    setupLabel: "Raised Mulched Beds",
    stageN: 4,
    stageTitle: "Fruit sizing & bulking",
    moistureBand: [58, 72],
    ecBand: [0.8, 2.5],
    basePh: 6.45,
    baseMoisture: 67.8,
    baseEc: 1.75,
    baseSoilTemp: 24.1,
    npk: [100, 90, 220],
    attentionCells: [
      { row: 0, col: 2, reason: "blight" },            // R1 T3: Early blight · 85%
      { row: 1, col: 3, reason: "blossom", ph: 5.75 }, // R2 T4: Blossom-end rot · 89% (off-range pH)
    ],
  },
  {
    zone: "g4",
    label: "G4 Drip Plot C",
    areaM2: 50,
    rows: 5,
    cols: 5,
    rowM: 2,
    treeM: 1,
    day: 78,
    variety: "Beefsteak",
    setup: "drip_plot",
    setupLabel: "High-density Drip Plot",
    stageN: 4,
    stageTitle: "Fruit sizing & bulking",
    moistureBand: [58, 72],
    ecBand: [0.8, 2.5],
    basePh: 6.25,
    baseMoisture: 66.5,
    baseEc: 1.9,
    baseSoilTemp: 25.0,
    npk: [95, 85, 235],
    attentionCells: [
      { row: 2, col: 2, reason: "pest" },              // R3 T3: Pest damage · 87%
      { row: 4, col: 4, reason: "dry", moisture: 54.0 },
    ],
    emptyCells: [[0, 4]],
  },
  {
    zone: "g5",
    label: "G5 Harvest Bed",
    areaM2: 105,
    rows: 2,
    cols: 5,
    rowM: 3,
    treeM: 3.5,
    day: 96,
    variety: "Roma Tomato",
    setup: "commercial",
    setupLabel: "Drip Row Commercial",
    stageN: 5,
    stageTitle: "Ripening & harvest",
    moistureBand: [58, 72],
    ecBand: [0.8, 2.5],
    basePh: 6.35,
    baseMoisture: 61.5,
    baseEc: 2.1,
    baseSoilTemp: 24.6,
    npk: [75, 75, 245],
    attentionCells: [],
  },
];

function resolvedHistoryAlert(zone: string, r: number, c: number, dayOffset: number): boolean {
  // G1 R1 T1 had a resolved yellow-leaf event 5-7 days ago so farmers see recovery in History
  return zone === "g1" && r === 0 && c === 0 && dayOffset >= 5 && dayOffset <= 7;
}

function makeCellsForDay(spec: DemoBlockSpec, dayOffset: number): RoverCell[] {
  const cells: RoverCell[] = [];
  const wave = Math.sin((spec.day - dayOffset) / 3.1);
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) {
      const isEmpty = spec.emptyCells?.some(([er, ec]) => er === r && ec === c);
      if (isEmpty) {
        cells.push({
          row: r,
          col: c,
          plant: false,
          flagged: false,
          canopy: 0,
          chlorosis: 0,
          readings: {},
          advice: { row: r, col: c, plant: false, litres: 0, fullLitres: 0, notes: ["No plant seen"] },
        });
        continue;
      }
      const attn = spec.attentionCells.find((a) => a.row === r && a.col === c);
      const along = c / Math.max(spec.cols - 1, 1) - 0.5;
      const jitter = (((r * 7 + c * 13 + dayOffset) % 9) - 4) * 0.08;
      const moisture = attn?.moisture ?? Number((spec.baseMoisture - along * 1.4 + wave * 1.0 + jitter * 2.2).toFixed(1));
      const ph = attn?.ph ?? Number((spec.basePh + jitter * 0.14 + wave * 0.03).toFixed(2));
      const ec = attn?.ec ?? Number((spec.baseEc + jitter * 0.08 + wave * 0.04).toFixed(2));
      const soilTemp = Number((spec.baseSoilTemp + jitter * 0.4).toFixed(1));

      const histYellow = resolvedHistoryAlert(spec.zone, r, c, dayOffset);
      const reason = attn?.reason;
      const isVisionAlert = reason === "yellow" || reason === "curl" || reason === "blight" || reason === "blossom" || reason === "pest" || histYellow;

      const histShift = dayOffset >= 3 && dayOffset <= 7 ? 0.06 : dayOffset >= 1 && dayOffset <= 2 ? 0.03 : 0;
      const chlorosis =
        reason === "yellow"
          ? Number((0.19 + histShift).toFixed(3))
          : reason === "blight" || reason === "curl" || reason === "pest"
            ? Number((0.13 + histShift * 0.7).toFixed(3))
            : histYellow
              ? 0.21
              : 0;

      const disease =
        reason === "yellow"
          ? "chlorosis"
          : reason === "curl"
            ? "leaf_curl"
            : reason === "blight"
              ? "early_blight"
              : reason === "blossom"
                ? "blossom_end_rot"
                : reason === "pest"
                  ? "pest_damage"
                  : histYellow
                    ? "chlorosis"
                    : null;

      const diseaseConfidence =
        reason === "yellow"
          ? 0.91
          : reason === "curl"
            ? 0.88
            : reason === "blight"
              ? 0.85
              : reason === "blossom"
                ? 0.89
                : reason === "pest"
                  ? 0.87
                  : histYellow
                    ? 0.88
                    : null;

      const canopy = Number((0.43 + (c % 3) * 0.04 - (isVisionAlert ? 0.06 : 0)).toFixed(3));
      const notes: string[] = [];
      if (reason === "yellow") notes.push("Yellow leaves (N deficiency)");
      else if (reason === "curl") notes.push("Leaf curl");
      else if (reason === "blight") notes.push("Early blight");
      else if (reason === "blossom") notes.push("Blossom-end rot");
      else if (reason === "pest") notes.push("Pest damage");
      if (moisture < spec.moistureBand[0]) notes.push("Dry soil");

      cells.push({
        row: r,
        col: c,
        plant: true,
        flagged: isVisionAlert,
        canopy,
        chlorosis,
        disease,
        disease_confidence: diseaseConfidence,
        readings: {
          soil_moisture: moisture,
          soil_ph: ph,
          soil_ec: ec,
          soil_temperature: soilTemp,
          nitrogen: attn?.nitrogen ?? Math.round(spec.npk[0] + jitter * 5),
          phosphorus: Math.round(spec.npk[1] + jitter * 3),
          potassium: Math.round(spec.npk[2] + jitter * 8),
          air_temperature: 26.8,
          air_humidity: 66.0,
        },
        advice: {
          row: r,
          col: c,
          plant: true,
          litres: Math.max(0, Number(((spec.moistureBand[1] - moisture) * 0.45).toFixed(1))),
          fullLitres: 7.5,
          notes,
        },
      });
    }
  }
  return cells;
}

export function buildDemoTomatoFarm() {
  const now = new Date();
  const isoAt = (daysBack: number) => {
    const d = new Date(now.getTime() - daysBack * 86_400_000);
    d.setHours(7, 15, 0, 0);
    return d.toISOString();
  };
  const isoForward = (daysAhead: number) => {
    const d = new Date(now.getTime() + daysAhead * 86_400_000);
    return d.toLocaleDateString("sv-SE");
  };

  const zones: ZoneNow[] = [
    ...SPECS.map((s) => ({
      zone: s.zone,
      label: s.label,
      areaM2: s.areaM2,
      moisturePct: s.baseMoisture,
      rain: false,
      supplyVoltage: 12.6,
      waterPh: 6.4,
      recordedAt: isoAt(0),
    })),
    {
      zone: "g6",
      label: "G6 Open Field",
      areaM2: 50,
      moisturePct: null,
      rain: false,
      supplyVoltage: null,
      waterPh: null,
      recordedAt: null,
    },
  ];

  const cycles: Cycle[] = SPECS.map((s) => {
    const activeCount = s.rows * s.cols - (s.emptyCells?.length ?? 0);
    const kgMid = Number((activeCount * 4.5).toFixed(1));
    const kgLow = Number((activeCount * 4.2).toFixed(1));
    const kgHigh = Number((activeCount * 4.8).toFixed(1));
    return {
      id: `demo-cycle-${s.zone}`,
      zone: s.zone,
      bedLabel: s.label,
      trialArm: s.zone === "g1" ? "guided" : null,
      crop: "tomato",
      cropName: "Tomato",
      variety: s.variety,
      plantedOn: isoAt(s.day).slice(0, 10),
      endedOn: null,
      status: "active",
      day: s.day,
      stage: s.stageTitle.toLowerCase(),
      stageTitle: s.stageTitle,
      plantCount: activeCount,
      areaM2: s.areaM2,
      setup: s.setup,
      setupLabel: s.setupLabel,
      expectedPriceUsdPerKg: 0.8,
      forecast: {
        setup: s.setup,
        label: s.setupLabel,
        plants: activeCount,
        kgLow,
        kgHigh,
        kgMid,
        pricePerKgUsd: 0.8,
        revenueLowUsd: Number((kgLow * 0.8).toFixed(2)),
        revenueHighUsd: Number((kgHigh * 0.8).toFixed(2)),
        basis: "Tomato precision drip benchmark (4.5 kg/plant)",
      },
      grid: { rows: s.rows, cols: s.cols, rowM: s.rowM, treeM: s.treeM },
    };
  });

  const REASON_TITLE: Record<DemoAttentionReason, [string, "critical" | "warning", string[], string]> = {
    yellow: [
      "Yellow lower leaves detected",
      "warning",
      ["nitrogen", "soil_ph"],
      "Inspect lower foliage and live soil N before adding granular fertilizer.",
    ],
    curl: [
      "Upper leaf curl & dry drip point",
      "critical",
      ["soil_moisture"],
      "Low moisture (54.2%) detected on drip end; pulse drip irrigation and check whitefly cards.",
    ],
    blight: [
      "Early blight lesions on lower leaf",
      "warning",
      ["soil_moisture", "soil_temperature"],
      "Prune spotted lower leaves 20–30 cm above mulch and apply Bacillus subtilis / copper spray.",
    ],
    blossom: [
      "Blossom-end rot risk · Acidic pH",
      "critical",
      ["soil_ph"],
      "Soil pH 5.75 limits calcium uptake; incorporate lime (50–80 g/m²) and stabilize drip moisture.",
    ],
    pest: [
      "Leafminer / whitefly pressure",
      "warning",
      ["nitrogen"],
      "Pinch mined leaves, hang yellow sticky cards, and apply spinosad or neem oil below 30 °C.",
    ],
    dry: [
      "Localized dry emitter spot",
      "warning",
      ["soil_moisture"],
      "Moisture dropped to 54.0% at end of bed; check drip emitter and pulse 2.0 L.",
    ],
    ph: [
      "Off-range soil pH",
      "warning",
      ["soil_ph"],
      "Buffer irrigation pH toward 6.2–6.5.",
    ],
  };

  const conditions: BedConditions[] = SPECS.map((s) => {
    const alerts: CondAlert[] = s.attentionCells.map((a, idx) => {
      const [title, severity, metrics, message] = REASON_TITLE[a.reason];
      return {
        id: `${s.zone}-${a.reason}-${idx}`,
        severity,
        title: `${title} (R${a.row + 1} T${a.col + 1})`,
        message,
        metrics,
      };
    });
    return {
      zone: s.zone,
      label: s.label,
      areaM2: s.areaM2,
      crop: "tomato",
      cropName: "Tomato",
      variety: s.variety,
      day: s.day,
      recordedAt: isoAt(0),
      rated: true,
      status: alerts.some((a) => a.severity === "critical") ? "critical" : alerts.length > 0 ? "warning" : "normal",
      basis: "tomato_demo",
      source: "Tomato Optimal Targets (pH 6.0–6.8 · Moisture 58–72%)",
      stage: {
        n: s.stageN,
        key: `stage-${s.stageN}`,
        title: s.stageTitle,
        firstDay: 1,
        lastDay: 120,
        day: s.day,
        extended: false,
        moisture: s.moistureBand,
        ec: s.ecBand,
        focus: s.stageTitle,
      },
      params: [
        { metric: "soil_moisture", label: "Soil moisture", short: "Moisture", unit: "pct", decimals: 1, value: s.baseMoisture, recordedAt: isoAt(0), status: "normal", direction: null, target: s.moistureBand },
        { metric: "soil_ph", label: "Soil pH", short: "pH", unit: "pH", decimals: 2, value: s.basePh, recordedAt: isoAt(0), status: "normal", direction: null, target: [6.0, 6.8] },
        { metric: "soil_ec", label: "Soil EC", short: "EC", unit: "mS/cm", decimals: 2, value: s.baseEc, recordedAt: isoAt(0), status: "normal", direction: null, target: [0.8, 2.5] },
        { metric: "soil_temperature", label: "Soil temperature", short: "Soil °C", unit: "C", decimals: 1, value: s.baseSoilTemp, recordedAt: isoAt(0), status: "normal", direction: null, target: [18, 29] },
        { metric: "nitrogen", label: "Nitrogen", short: "N", unit: "mg/kg", decimals: 0, value: s.npk[0], recordedAt: isoAt(0), status: "unrated", direction: null, target: null },
        { metric: "phosphorus", label: "Phosphorus", short: "P", unit: "mg/kg", decimals: 0, value: s.npk[1], recordedAt: isoAt(0), status: "unrated", direction: null, target: null },
        { metric: "potassium", label: "Potassium", short: "K", unit: "mg/kg", decimals: 0, value: s.npk[2], recordedAt: isoAt(0), status: "unrated", direction: null, target: null },
        { metric: "air_temperature", label: "Air temperature", short: "Air °C", unit: "C", decimals: 1, value: 26.8, recordedAt: isoAt(0), status: "normal", direction: null, target: [20, 30] },
        { metric: "air_humidity", label: "Air humidity", short: "RH", unit: "pct", decimals: 1, value: 66.0, recordedAt: isoAt(0), status: "normal", direction: null, target: [55, 75] },
      ],
      alerts,
    };
  });

  const roundsById = new Map<string, DemoRoundDetail>();
  const roundsByZone = new Map<string, DemoRoundDetail>();
  const surveys: SurveySummary[] = [];
  const advice: Advice[] = [];

  for (const s of SPECS) {
    for (let back = 0; back < 10; back++) {
      const id = `demo-${s.zone}-${back}`;
      const cells = makeCellsForDay(s, back);
      const startedAt = isoAt(back);
      const finishedAt = new Date(new Date(startedAt).getTime() + 18 * 60_000).toISOString();
      const summary: SurveySummary = {
        id,
        zone: s.zone,
        bedLabel: s.label,
        status: "completed",
        abortReason: null,
        simulated: false,
        rows: s.rows,
        cols: s.cols,
        cellM: s.treeM,
        cellsScanned: cells.length,
        plantsDetected: cells.filter((c) => c.plant).length,
        cellsFlagged: cells.filter((c) => c.flagged).length,
        distanceM: Number(((s.rows * s.cols - 1) * s.treeM).toFixed(1)),
        estDurationS: s.rows * s.cols * 45,
        startedAt,
        finishedAt,
      };
      const detail: DemoRoundDetail = { ...summary, cells };
      surveys.push(summary);
      roundsById.set(id, detail);
      if (back === 0) {
        roundsByZone.set(s.zone, detail);
        const litres = Math.round(cells.reduce((sum, c) => sum + (c.advice?.litres ?? 0), 0));
        const fullLitres = Math.round(cells.reduce((sum, c) => sum + (c.advice?.fullLitres ?? 0), 0));
        const hasLowN = s.attentionCells.some((a) => (a.nitrogen ?? s.npk[0]) < 80);
        advice.push({
          zone: s.zone,
          label: s.label,
          cycleId: `demo-cycle-${s.zone}`,
          day: s.day,
          stage: { n: s.stageN, short: s.stageTitle.split(" ")[0], title: s.stageTitle },
          surveyed: true,
          surveyedAt: finishedAt,
          simulated: false,
          partial: false,
          treesSeen: summary.plantsDetected ?? 0,
          treesWatered: cells.filter((c) => (c.advice?.litres ?? 0) > 0).length,
          water: {
            litres,
            fullLitres,
            savedLitres: Math.max(0, fullLitres - litres),
            hours: 0.4,
            emitterLph: 8,
            firmwareLimitSeconds: 90,
            raining: false,
            paused: false,
            et0: 4.5,
          },
          feed: {
            action: hasLowN ? "feed" : "wait",
            reason: hasLowN
              ? "Spot nitrogen deficit on R2 T2 (64 mg/kg)"
              : `Soil N optimal (${s.npk[0]} mg/kg) · Hold extra N`,
            due: hasLowN,
            nextDay: s.day + 4,
            aim: "Balanced Tomato NPK + Calcium",
            nitrogen: `${s.npk[0]} mg/kg`,
            notes: [],
            dose: null,
            plannedDose: null,
          },
          trees: cells.map((c) => c.advice).filter((a): a is NonNullable<typeof a> => Boolean(a)),
          todo: [],
          source: "AgriRover Tomato Targets",
        });
      }
    }
  }

  surveys.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  function telemetryFor(zone: string, hours: number): TelemetrySeries {
    const spec = SPECS.find((s) => s.zone === zone) ?? SPECS[0];
    const points = Math.min(30, Math.max(10, Math.round(hours / 24)));
    const from = new Date(now.getTime() - hours * 3_600_000).toISOString();
    const to = now.toISOString();
    const series: Record<string, { t: string; v: number }[]> = {
      soil_moisture: [],
      soil_ph: [],
      soil_ec: [],
      soil_temperature: [],
      nitrogen: [],
      phosphorus: [],
      potassium: [],
      air_temperature: [],
      air_humidity: [],
    };
    for (let i = points - 1; i >= 0; i--) {
      const t = new Date(now.getTime() - (i / Math.max(1, points - 1)) * hours * 3_600_000).toISOString();
      const wave = Math.sin(i / 2.2);
      series.soil_moisture.push({ t, v: Number((spec.baseMoisture + wave * 2.2).toFixed(1)) });
      series.soil_ph.push({ t, v: Number((spec.basePh + wave * 0.08).toFixed(2)) });
      series.soil_ec.push({ t, v: Number((spec.baseEc + wave * 0.07).toFixed(2)) });
      series.soil_temperature.push({ t, v: Number((spec.baseSoilTemp + wave * 0.6).toFixed(1)) });
      series.nitrogen.push({ t, v: Math.round(spec.npk[0] + wave * 4) });
      series.phosphorus.push({ t, v: Math.round(spec.npk[1] + wave * 3) });
      series.potassium.push({ t, v: Math.round(spec.npk[2] + wave * 6) });
      series.air_temperature.push({ t, v: Number((26.8 + wave * 1.3).toFixed(1)) });
      series.air_humidity.push({ t, v: Number((66.0 - wave * 4.0).toFixed(1)) });
    }
    return { zone, hours, bucketSeconds: Math.round((hours * 3600) / points), from, to, series };
  }

  function buildSchedule(days = 14): Schedule {
    const dates = Array.from({ length: Math.min(days, 14) }, (_, i) => isoForward(i));
    const advByZone = new Map(advice.map((a) => [a.zone, a]));
    const blocks = SPECS.map((s) => {
      const adv = advByZone.get(s.zone);
      const todayL = adv?.water.litres ?? 25;
      const plants = s.rows * s.cols - (s.emptyCells?.length ?? 0);
      // Calibrated around ~3.9 L/plant/day precision drip inside 58-72% target band (~1,890 L across 7 days)
      const deficitBoost = s.baseMoisture < 64 ? 1.05 : 0.98;
      const steadyL = Math.round(plants * 3.95 * deficitBoost);
      return {
        zone: s.zone,
        label: s.label,
        cycleId: `demo-cycle-${s.zone}`,
        trees: plants,
        day: s.day,
        stage: s.stageTitle,
        water: dates.map((d, i) => ({
          date: d,
          day: s.day + i,
          stage: s.stageTitle,
          litres: i === 0 ? todayL : steadyL,
          kind: (i === 0 ? "today" : "planned") as "today" | "planned",
        })),
      };
    });

    const events: ScheduleEvent[] = [
      {
        zone: "g1",
        label: "G1 Greenhouse North",
        date: isoForward(0),
        lastDate: isoForward(1),
        firstDay: 32,
        lastDay: 33,
        kind: "task",
        title: "Prune yellowing lower leaves on G1 R2 T2",
        detail: "Soil N is already optimal (109 mg/kg), pH 6.35, Moisture 63.6% — prune aging lower leaves and skip granular fertilizer.",
        state: "due",
        confirm: false,
      },
      {
        zone: "g1",
        label: "G1 Greenhouse North",
        date: isoForward(1),
        lastDate: isoForward(3),
        firstDay: 33,
        lastDay: 35,
        kind: "foliar",
        title: "Treat Early blight spot on G1 R3 T2 (Bacillus subtilis)",
        detail: "Prune spotted lower leaves 20–30 cm above mulch; apply Bacillus subtilis (5–10 g/L) below 30 °C and review rover rescan in 48–72 h.",
        state: "later",
        confirm: false,
      },
      {
        zone: "g2",
        label: "G2 Commercial Bed A",
        date: isoForward(0),
        lastDate: isoForward(1),
        firstDay: 48,
        lastDay: 49,
        kind: "water",
        title: "Pulse drip 2.5 L on G2 R1 T5 (Leaf curl · 54.2% moisture)",
        detail: "Restore soil moisture from 54.2% back into 58–72% target band and check yellow sticky cards for whiteflies.",
        state: "due",
        confirm: false,
      },
      {
        zone: "g2",
        label: "G2 Commercial Bed A",
        date: isoForward(0),
        lastDate: isoForward(1),
        firstDay: 48,
        lastDay: 49,
        kind: "feed",
        title: "Targeted nitrogen top-up on G2 R2 T2 (Soil N 64 mg/kg)",
        detail: "Only G2 has low Soil N (< 80 mg/kg). Drench 1.5–2 L fish emulsion (15 mL/L); skipping healthy blocks like G1 (109 mg/kg).",
        state: "due",
        confirm: false,
      },
      {
        zone: "g3",
        label: "G3 Raised Beds B",
        date: isoForward(0),
        lastDate: isoForward(2),
        firstDay: 64,
        lastDay: 66,
        kind: "task",
        title: "Inspect Early blight spot on G3 R1 T3",
        detail: "Remove infected lower leaves and keep drip-only irrigation before 09:00 so canopy stays dry.",
        state: "due",
        confirm: false,
      },
      {
        zone: "g3",
        label: "G3 Raised Beds B",
        date: isoForward(0),
        lastDate: isoForward(2),
        firstDay: 64,
        lastDay: 66,
        kind: "task",
        title: "Apply lime + Ca foliar on G3 R2 T4 (Blossom-end rot · pH 5.75)",
        detail: "Work 50–80 g/m² agricultural lime into drip zone to lift pH into 6.0–6.8 and apply chelated calcium spray (3–4 mL/L).",
        state: "due",
        confirm: false,
      },
      {
        zone: "g4",
        label: "G4 Drip Plot C",
        date: isoForward(1),
        lastDate: isoForward(3),
        firstDay: 79,
        lastDay: 81,
        kind: "foliar",
        title: "Pinch mined leaves & spray neem/spinosad on G4 R3 T3",
        detail: "Target underside of leaves early morning or dusk below 30 °C; verify zero new trails in 72 h scan.",
        state: "later",
        confirm: false,
      },
      {
        zone: "g1",
        label: "G1 Greenhouse North",
        date: isoForward(3),
        lastDate: isoForward(6),
        firstDay: 35,
        lastDay: 38,
        kind: "stage",
        title: "Growth milestone: Flowering -> Fruit Set transition",
        detail: "Maintain steady 58–72% moisture and 0.8–2.5 mS/cm EC during early tomato cluster pollination.",
        state: "later",
        confirm: false,
      },
      {
        zone: "g2",
        label: "G2 Commercial Bed A",
        date: isoForward(4),
        lastDate: isoForward(7),
        firstDay: 52,
        lastDay: 55,
        kind: "stage",
        title: "Growth milestone: Fruit Set -> Fruit Sizing & Bulking",
        detail: "Ensure calcium flow remains steady via uniform drip cycles as green tomatoes swell.",
        state: "later",
        confirm: false,
      },
      {
        zone: "g4",
        label: "G4 Drip Plot C",
        date: isoForward(5),
        lastDate: isoForward(7),
        firstDay: 83,
        lastDay: 85,
        kind: "stage",
        title: "Growth milestone: Fruit Sizing -> Ripening transition",
        detail: "Prepare selective lower-cluster harvest trays and avoid excess water swings.",
        state: "later",
        confirm: false,
      },
      {
        zone: "g5",
        label: "G5 Harvest Bed",
        date: isoForward(2),
        lastDate: isoForward(5),
        firstDay: 98,
        lastDay: 101,
        kind: "harvest",
        title: "Selective tomato harvest pick (~18 kg Roma Tomato)",
        detail: "Harvest breaker/red clusters for Phnom Penh & Kandal wholesale deliveries.",
        state: "later",
        confirm: false,
      },
    ];

    return {
      start: isoForward(0),
      days,
      roundTime: "07:00",
      dates,
      events,
      blocks,
    };
  }

  const stockItems: StockItem[] = [
    { id: "stk-npk", name: "Soluble Tomato NPK (12-12-17 + TE)", category: "fertilizer", unit: "kg", qtyOnHand: 42.5, avgUnitCostUsd: 1.85, valueUsd: 78.63 },
    { id: "stk-ca", name: "Chelated Calcium + Dolomitic Lime", category: "fertilizer", unit: "kg", qtyOnHand: 28.0, avgUnitCostUsd: 1.2, valueUsd: 33.6 },
    { id: "stk-bacillus", name: "Bacillus subtilis + Copper Bio-Spray", category: "pesticide", unit: "L", qtyOnHand: 14.5, avgUnitCostUsd: 6.4, valueUsd: 92.8 },
    { id: "stk-neem", name: "Cold-Pressed Neem Oil & Spinosad", category: "pesticide", unit: "L", qtyOnHand: 9.2, avgUnitCostUsd: 8.1, valueUsd: 74.52 },
    { id: "stk-mulch", name: "Straw Mulch & Drip Emitter Pack", category: "materials", unit: "pack", qtyOnHand: 18, avgUnitCostUsd: 4.5, valueUsd: 81.0 },
    { id: "stk-seed", name: "Roma & Cherry Belle Grafted Seedlings", category: "seed", unit: "tray", qtyOnHand: 6, avgUnitCostUsd: 3.2, valueUsd: 19.2 },
  ];

  const assets: Asset[] = [
    { id: "ast-rover", name: "AgriRover Autonomous Probe & Vision Unit", costUsd: 1850, boughtOn: isoAt(120).slice(0, 10), lifeYears: 5, salvageUsd: 250, retiredOn: null, dailyDepreciationUsd: 0.877, status: "in_service" },
    { id: "ast-drip", name: "Solar Precision Drip Manifold (G1–G6)", costUsd: 640, boughtOn: isoAt(180).slice(0, 10), lifeYears: 6, salvageUsd: 60, retiredOn: null, dailyDepreciationUsd: 0.265, status: "in_service" },
  ];

  const devices: DeviceRow[] = [
    { code: "ROVER-TOM-01", kind: "field_rover", zone: "g1", commissioned: true, status: "online", link: "online", lastSeenAt: isoAt(0), firmwareVersion: "v2.4.1-tomato" },
    { code: "DRIP-CTRL-A", kind: "irrigation_valve", zone: "g2", commissioned: true, status: "online", link: "online", lastSeenAt: isoAt(0), firmwareVersion: "v1.9.0" },
  ];

  const settings: Settings = {
    khrPerUsd: 4085,
    rateConfirmed: true,
    familyWageUsdPerDay: 8.5,
    waterCostPerM3Usd: 0.52,
    landRentUsdPerHaYear: 450,
    irrigationEfficiency: 0.9,
  };

  const harvestsByZone = new Map<string, Harvest[]>([
    ["g5", [{ id: "hv-g5-1", date: isoAt(3).slice(0, 10), kgTotal: 22.5, kgMarketable: 21.8, kgHome: 0.5, kgLost: 0.2, note: "First Roma harvest flush", sample: true }]],
    ["g4", [{ id: "hv-g4-1", date: isoAt(2).slice(0, 10), kgTotal: 16.4, kgMarketable: 15.6, kgHome: 0.4, kgLost: 0.4, note: "Early Beefsteak pick", sample: true }]],
    ["g3", [{ id: "hv-g3-1", date: isoAt(1).slice(0, 10), kgTotal: 9.2, kgMarketable: 8.8, kgHome: 0.2, kgLost: 0.2, note: "San Marzano breakers", sample: true }]],
  ]);

  const salesByZone = new Map<string, Sale[]>([
    ["g5", [{ id: "sl-g5-1", date: isoAt(2).slice(0, 10), kg: 21.8, pricePerKg: 0.82, currency: "USD", amountUsd: 17.88, buyer: "Phnom Penh Fresh Market", sample: true }]],
    ["g4", [{ id: "sl-g4-1", date: isoAt(1).slice(0, 10), kg: 15.6, pricePerKg: 0.85, currency: "USD", amountUsd: 13.26, buyer: "Aeon Fresh Produce", sample: true }]],
    ["g3", [{ id: "sl-g3-1", date: isoAt(0).slice(0, 10), kg: 8.8, pricePerKg: 0.8, currency: "USD", amountUsd: 7.04, buyer: "Kandal Wholesale Co-op", sample: true }]],
  ]);

  const costsByZone = new Map<string, CostEntry[]>();

  return {
    zones,
    cycles,
    conditions,
    advice,
    surveys,
    roundsById,
    roundsByZone,
    telemetryFor,
    schedule: buildSchedule(14),
    buildSchedule,
    stockItems,
    assets,
    devices,
    settings,
    harvestsByZone,
    salesByZone,
    costsByZone,
  };
}

/** Backwards-compatible alias while keeping a single synchronized tomato store across the app. */
export const buildDemoOrchardData = buildDemoTomatoFarm;

