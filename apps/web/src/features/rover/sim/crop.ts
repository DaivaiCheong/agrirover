// Tomato: what each plant problem looks like to a camera, and how an agronomist reads it.
// The camera sees signs, not causes; the advice engine turns a sign into a likely cause with the soil reading beside it.
// Hints from extension guides (links in docs/rover-redesign.md, "Diagnosis hints for tomato").

/** A plant's hidden truth in the simulation. */
export type Condition = "healthy" | "waterStress" | "nitrogen" | "earlyBlight" | "septoria" | "leafCurl" | "bacterialWilt" | "pests";
/** What a camera can see. */
export type Sign = "yellowLower" | "ringSpots" | "smallSpots" | "curlUpper" | "wilt" | "insects";

/** Where on the plant a sign shows (fraction of plant height above its base) and how big one mark is (mm). */
export const SIGN_LOOK: Record<Sign, { from: number; to: number; sizeMm: number; word: string }> = {
  yellowLower: { from: 0.0, to: 0.35, sizeMm: 40, word: "Yellow lower leaves" },
  ringSpots: { from: 0.0, to: 0.40, sizeMm: 10, word: "Spots with rings" },
  smallSpots: { from: 0.0, to: 0.40, sizeMm: 3, word: "Small grey spots" },
  curlUpper: { from: 0.70, to: 1.0, sizeMm: 30, word: "Curled young leaves" },
  wilt: { from: 0.0, to: 1.0, sizeMm: 60, word: "Drooping plant" },
  insects: { from: 0.0, to: 0.60, sizeMm: 1.5, word: "Insects on leaves" },
};

export const SIGN_OF: Record<Condition, Sign | null> = {
  healthy: null, waterStress: "wilt", nitrogen: "yellowLower", earlyBlight: "ringSpots", septoria: "smallSpots",
  leafCurl: "curlUpper", bacterialWilt: "wilt", pests: "insects",
};

export interface Hint {
  likely: string;              // short cause, card line
  couldAlso: string;
  howToTell: string;
  firstStep: string;
  /** a problem that spreads plant to plant */ spreads: boolean;
}

/** How an agronomist reads each sign. Cultural steps only: the app never names a pesticide, fungicide or fertiliser
 *  product or dose; chemical options come only from the farmer's own product list, with "follow the label". */
export const HINTS: Record<Sign, Hint> = {
  yellowLower: {
    likely: "Likely low nitrogen", couldAlso: "Too much water; low magnesium",
    howToTell: "Even yellow, or yellow between green veins (magnesium)? Any spots? Wet soil?",
    firstStep: "Check the fertiliser plan with an agronomist", spreads: false,
  },
  ringSpots: {
    likely: "Likely early blight", couldAlso: "Septoria leaf spot",
    howToTell: "Rings inside the spots, up to about 12 mm across? Then blight",
    firstStep: "Remove affected lower leaves; help leaves dry quickly", spreads: true,
  },
  smallSpots: {
    likely: "Likely Septoria leaf spot", couldAlso: "Early blight seen from a distance",
    howToTell: "Small speckled spots, about 3 mm, without rings",
    firstStep: "Water at the base; don't work plants while leaves are wet; remove infected leaves", spreads: true,
  },
  curlUpper: {
    likely: "Likely leaf curl virus", couldAlso: "Low potassium or magnesium",
    howToTell: "Whiteflies under the leaves? Upper leaves yellow at the edges and curled up?",
    firstStep: "Mark the plant; tell an agronomist or extension officer", spreads: true,
  },
  wilt: {
    likely: "Likely bacterial wilt", couldAlso: "Water stress (but then the soil is dry)",
    howToTell: "Cut a fresh stem and stand it in clear water: a milky stream within minutes",
    firstStep: "Mark it and tell an agronomist; the bacteria spread through irrigation water", spreads: true,
  },
  insects: {
    likely: "Likely whiteflies", couldAlso: "Aphids",
    howToTell: "Shake a leaf: a cloud of tiny white insects? Look under the leaves",
    firstStep: "Check the undersides on the field walk; tell an agronomist", spreads: true,
  },
};

/** Detection model: P = σ(a ln px + b f_visible − c blur + k); nothing is found where the camera cannot see. */
export const DETECT = { a: 2, b: 3, c: 0.4, k: -6, falsePositive: 0.02, fpScore: [0.35, 0.65] as [number, number] };
