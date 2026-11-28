// Every default of the ROVER-01 twin, in SI units (m, s, kg, N, V, A, W, J; angles in degrees only where named *Deg).
// Each value says where it comes from: "sourced" (datasheet or reference, linked in docs/rover-redesign.md),
// "estimate – measure" (replace with a measurement on the real rover), or "assumption" (a choice to confirm).
// Nothing else in sim/ holds a default: a module takes these as arguments, so a Lab patch reaches every model.

export const G0 = 9.81;                                  // m/s²

export type Basis = "sourced" | "estimate – measure" | "assumption";

/** Two motors in parallel on one L298N channel per side (the build prompt's rover), or one channel per motor
 *  on two L298N boards (ROVER-01 as wired: rover-mc-2.1.0, docs/ROVER-PARTS.md). */
export type DriverWiring = "perSide" | "perMotor";
export type CameraMode = "turn" | "pan" | "side" | "twoSide";
export type ProbeKind = "blade" | "twinRod";
export type SurfaceKind = "packed" | "loose" | "mud";
/** What a 0.25 m soil cell is: a walked-on lane, tilled soil, or the plant bed. */
export type SoilKind = "lane" | "tilled" | "bed";

export interface MotorBench {
  vTest: number;          // V, bench supply for the four numbers below
  rpmNoLoad: number;      // output shaft, rpm
  iNoLoad: number;        // A
  iStall: number;         // A
  tauStall: number;       // N·m at the output shaft (rated)
  gear: number;           // ratio
}

export interface RoverProfile {
  mass: number; wheelRadius: number; track: number; wheelbase: number;
  bodyLength: number; bodyWidth: number; cgHeight: number;
  cgX: number;                                   // m ahead of the body centre (axles at ±wheelbase/2)
  motor: MotorBench;
  motorSpread: number;                           // σ of each motor's no-load speed and resistance, as a fraction
  driver: { wiring: DriverWiring; dropV0: number; dropPerA: number; channelLimitA: number;
            quiescentA: number;                  // per board, from the motor supply
            logic5vA: number;                    // per board, from 5 V
          };
  motorCapV: number; motorCapOn: boolean;        // firmware cap on the average motor voltage
  deadbandFactor: number;                        // a motor starts when K·I exceeds this × τf
  battery: { cells: number; capacityAh: number; rPack: number; floorPct: number; criticalCellV: number;
             currentGainSigma: number; restA: number; restS: number };
  /** The pack voltage the reference numbers are computed at (rover_sanity.py), about 78 % charged at rest. */
  refPackV: number;
  rail5v: { source: "buck" | "linear"; buckEff: number; cameraA: number; controllerA: number; sensorsA: number };
  camera: { diagFovDeg: number; widthPx: number; heightPx: number; mountHeight: number; mountForward: number;
            tiltDeg: number; mastHz: number; mastZeta: number; exposureS: number; captureS: number;
            mode: CameraMode; servoSPer60Deg: number; servoA: number; secondCameraW: number };
  wifi: { txDbm: number; antennaHeight: number; extraLossDb: number; videoDbm: number; telemetryDbm: number; lostDbm: number };
  probe: { kind: ProbeKind; x: number; strokeM: number; leadM: number; screwEff: number; readS: number };
  turning: { chi: number };
  control: { cruise: number; accel: number; pivotRateDeg: number; pivotAccelDeg: number;
             kPsi: number; kY: number; omegaMax: number; laneClearance: number; stopTolM: number; alignDeg: number;
             timeSpeedErr: number };
  gyro: { noiseDegPerRtHz: number; offsetMaxDeg: number; tempDriftDeg: number; calibrateS: number };
}

export const ROVER: RoverProfile = {
  mass: 1.2,                     // estimate – measure: weigh
  wheelRadius: 0.0325,           // estimate – measure: 65 mm TT wheel
  track: 0.17,                   // estimate – measure: wheel centres
  wheelbase: 0.14,               // estimate – measure
  bodyLength: 0.24, bodyWidth: 0.20,   // estimate
  cgHeight: 0.07,                // estimate – measure (pencil balance)
  cgX: 0,                        // estimate – measure
  motor: {                       // sourced: Adafruit 3777 bench numbers at 6 V, rated stall torque 0.8 kgf·cm, 1:48
    vTest: 6, rpmNoLoad: 250, iNoLoad: 0.16, iStall: 1.5, tauStall: 0.0785, gear: 48,
  },
  motorSpread: 0.05,             // estimate: seeded N(1, 0.05²) per motor
  driver: {
    wiring: "perSide",           // assumption: the build prompt's reference wiring; ROVER-01 is "perMotor" (REAL_ROVER)
    dropV0: 1.4, dropPerA: 1.15, // sourced: LM18298 source + sink saturation, typical (2.55 V at 1 A, 3.7 V at 2 A)
    channelLimitA: 2.0,          // sourced: ST L298, 2 A DC per channel
    quiescentA: 0.03,            // sourced: ST L298, 13–50 mA from the motor supply
    logic5vA: 0.024,             // sourced: ST L298, 7–24 mA from 5 V
  },
  motorCapV: 6.0, motorCapOn: true,   // assumption: firmware caps the TT motors at their 6 V rating
  deadbandFactor: 1.5,           // estimate: static friction 1.5 × running friction
  battery: {
    cells: 3, capacityAh: 2.5,   // estimate – measure: read the cell label
    rPack: 0.20,                 // estimate – measure: ΔV ÷ ΔI when the motors start
    floorPct: 10, criticalCellV: 3.3,   // assumption: reserve floor; cut-off under load, I·R corrected
    currentGainSigma: 0.03,      // estimate: current-sensor gain error
    restA: 0.3, restS: 30,       // assumption: below 0.3 A for 30 s counts as rested
  },
  refPackV: 11.7,                // assumption: implied by the reference table (3.9 V a cell)
  rail5v: {
    source: "buck", buckEff: 0.85,   // assumption – confirm
    cameraA: 0.20,               // sourced: DFRobot ESP32-CAM, 180 mA at 5 V flash off (rounded up)
    controllerA: 0.08, sensorsA: 0.01,  // estimate
  },
  camera: {
    diagFovDeg: 65, widthPx: 800, heightPx: 600,   // sourced: OV2640 stock lens (M5Stack ESP32-CAM), 4:3
    mountHeight: 0.17, mountForward: 0.10, tiltDeg: 0,   // estimate – measure
    mastHz: 12, mastZeta: 0.06,  // estimate: PLA bracket
    exposureS: 1 / 60,           // estimate: daylight auto-exposure
    captureS: 1.2,               // estimate: frames saved
    mode: "turn",                // ROVER-01 today: turn the rover to look
    servoSPer60Deg: 0.1, servoA: 0.23,   // estimate: micro servo
    secondCameraW: 1.0,          // estimate: a second ESP32-CAM
  },
  wifi: {
    txDbm: 17,                   // sourced: DFRobot ESP32-CAM, 802.11b
    antennaHeight: 0.2,          // estimate
    extraLossDb: 10,             // estimate: PCB antenna low on the chassis
    videoDbm: -70, telemetryDbm: -88, lostDbm: -90,   // sourced: ESP32-CAM sensitivity (54 Mbps, 1 Mbps)
  },
  probe: {
    kind: "blade",               // assumption: capacitive v1.2 blade (DFRobot SEN0193) – confirm
    x: 0,                        // assumption: between the axles, at the centre
    strokeM: 0.06,
    leadM: 0.00125, screwEff: 0.20,   // assumption: M8 rod
    readS: 3,                    // assumption: 3 s of stable readings
  },
  turning: { chi: 1.6 },         // estimate – measure: pivot test
  control: {
    cruise: 0.15, accel: 0.3,    // assumption
    pivotRateDeg: 45, pivotAccelDeg: 180,   // assumption
    kPsi: 2.0, kY: 1.5, omegaMax: 1.0,      // assumption: Stanley-style gains
    laneClearance: 0.10,         // estimate: lane free space each side
    stopTolM: 0.02, alignDeg: 2,
    timeSpeedErr: 0.10,          // estimate: speed spread when driving by time alone
  },
  gyro: {
    noiseDegPerRtHz: 0.005,      // sourced: TDK MPU-6050
    offsetMaxDeg: 20,            // sourced: MPU-6050 initial zero-rate offset
    tempDriftDeg: 0.02,          // estimate: °/s per °C
    calibrateS: 2,
  },
};

/** ROVER-01 as wired today: two L298N boards, one channel a motor. */
export const REAL_ROVER: RoverProfile = { ...ROVER, driver: { ...ROVER.driver, wiring: "perMotor" } };

/** Which hardware values are measured or sourced, for the Hardware tab's "what to measure". */
export const BASIS: Record<string, Basis> = {
  mass: "estimate – measure", wheelRadius: "estimate – measure", track: "estimate – measure", wheelbase: "estimate – measure",
  cgHeight: "estimate – measure", motor: "sourced", driver: "sourced", "battery.capacityAh": "estimate – measure",
  "battery.rPack": "estimate – measure", "rail5v.cameraA": "sourced", "rail5v.source": "assumption", camera: "sourced",
  "camera.mount": "estimate – measure", "camera.mast": "estimate – measure", wifi: "sourced", probe: "assumption",
  "turning.chi": "estimate – measure", soil: "estimate – measure", gyro: "sourced",
};

// ---------- battery ----------

/** Rested open-circuit voltage per cell: generic 18650 Li-ion, 25 °C, 30 min rest (Zbotic SOC guide).
 *  Cold shifts the curve down by 0.2–0.3 V. Replace with your cell's own curve. */
export const OCV_SOC = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];          // %
export const OCV_V = [3.00, 3.49, 3.61, 3.67, 3.71, 3.74, 3.78, 3.83, 3.96, 4.08, 4.20];

// ---------- wheel–soil ----------

export interface SurfaceCoef { crr: number; mu: number; muLat: number; s0: number }
/** estimate – measure: fit with the pull test (wheels locked, pulled sideways, free rolling). */
export const SURFACES: Record<SurfaceKind, SurfaceCoef> = {
  packed: { crr: 0.06, mu: 0.60, muLat: 0.55, s0: 0.12 },
  loose: { crr: 0.15, mu: 0.55, muLat: 0.50, s0: 0.18 },
  mud: { crr: 0.25, mu: 0.35, muLat: 0.35, s0: 0.25 },
};
/** A cell's coefficients blend from its kind toward mud as θ rises over this range. */
export const MUD_BLEND = { from: 0.32, to: 0.40 };
export const SOIL_SURFACE: Record<SoilKind, SurfaceKind> = { lane: "packed", tilled: "loose", bed: "loose" };

// ---------- soil probe ----------

export const PROBE_SOIL = {
  ciRef: { lane: 1.2e6, tilled: 0.25e6, bed: 0.25e6 } as Record<SoilKind, number>,   // Pa at θ = thetaRef (estimate)
  thetaRef: 0.25, ciExponent: -2,                 // CI = CIref (θ/0.25)^−2 (USDA-ARS trend; estimate)
  adhesion: 1000,                                 // Pa (estimate)
  muSoil: 0.4, k0: 0.5, gamma: 15000,             // –, –, N/m³ (estimate)
  liftKeep: 0.10,                                 // assumption: keep 10 % of the weight on the wheels
  laneToBed: { bare: 0.8, mulchDrip: 0.5 },       // θ_lane = k θ_bed (estimate)
  noiseSd: 0.02,                                  // reading noise (estimate)
};
export const PROBES: Record<ProbeKind, { tipArea: number; perimeter: number; kShape: number }> = {
  blade: { tipArea: 0.023 * 0.0016, perimeter: 2 * (0.023 + 0.0016), kShape: 1 },   // v1.2 tip 23 × 1.6 mm
  twinRod: { tipArea: 2 * Math.PI * 0.0015 ** 2, perimeter: 2 * Math.PI * 0.003, kShape: 0.6 },   // two 3 mm cone-tip rods
};

// ---------- agronomy (FAO-56, tomato on loam) ----------

export const AGRONOMY = {
  thetaFC: 0.27, thetaWP: 0.12,    // sourced: loam (MPCA)
  rootDepth: 0.40,                 // assumption: effective for drip tomato (FAO-56 max 0.7–1.5 m)
  p: 0.40, kc: 1.15,               // sourced: FAO-56 ch. 6 and 8
  et0: 4.5,                        // assumption: mm/day; replace with your station
  wettedWidth: 0.30,               // assumption: m
  appEff: 0.90,                    // assumption: drip application efficiency
  emitterLph: 2,                   // assumption
  waterNowFrac: 0.25,              // "water now" at θWP + 0.25 (θtrigger − θWP)
  tooWetOver: 0.03,                // "too wet" above θFC + 0.03
  rainEff: 0.8, rainProbMin: 0.6, holdBelowL: 0.5,
};

// ---------- Wi-Fi ----------

export const LINK = {
  freqGHz: 2.437,                  // channel 6
  apHeight: 2.0, apGainDbi: 3, roverGainDbi: 0,   // estimate
  foliageM: 3,                     // estimate: foliage along the path (fits the RSSI table)
  lossWidthDb: 1.5,                // logistic width of packet loss around a threshold (estimate)
};

// ---------- field ----------

export interface FieldProfile {
  id: string; label: string; crop: string;
  rows: number; spots: number; rowM: number; plantM: number;
  /** [row, spot] from 0 with no plant */ empty: [number, number][];
  laneKind: SoilKind; bedKind: SoilKind; theta: number;
  bed: "flat" | "raised"; bedHeight: number; bedTop: number;
  overrun: number; headland: number;
  plantHeight: number; canopyRadius: number;
}

/** Block T1: 5 rows × 20 spots, 97 tomato plants, rows 1.0 m apart, plants 0.5 m. */
export const T1: FieldProfile = {
  id: "t1", label: "T1 Tomato", crop: "Tomato",
  rows: 5, spots: 20, rowM: 1.0, plantM: 0.5,
  empty: [[0, 17], [1, 14], [3, 2]],               // R1-P18, R2-P15, R4-P03
  laneKind: "lane", bedKind: "bed", theta: 0.24,
  bed: "flat", bedHeight: 0.15, bedTop: 0.5,
  overrun: 0.35, headland: 0.6,
  plantHeight: 1.0, canopyRadius: 0.35,
};

// ---------- safety ----------

export const SAFETY = {
  heartbeatS: 3, rainWetS: 10, stuckSlip: 0.8, stuckS: 3, stallFrac: 0.9, stallS: 1, cooldownS: 30,
  overloadS: 1, tiltDeg: 25, tiltS: 0.5, liftPitchDeg: 2, watchdogS: 0.5, geofenceM: 0.3,
  reserveFactor: 1.5, critAvgS: 2, backOffM: 0.05, reverseM: 0.1,
  latencyOnboardS: 0.03, latencyWifiS: 0.25,
};

/** The physics step and the loop rates (Hz). */
export const RATES = { physics: 200, control: 50, mission: 10, telemetry: 10 };

/** A deep merge of a Lab patch onto a profile. */
export function patch<T>(base: T, p?: DeepPartial<T>): T {
  if (!p) return base;
  const out: Record<string, unknown> = Array.isArray(base) ? [...(base as unknown[])] as never : { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" ? patch(b, v as never) : v;
  }
  return out as T;
}
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
