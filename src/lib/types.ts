import { SerialCheck } from './data/serialValidation';

export type AuthenticitySignal = {
  signal: string;
  // Thai translation of `signal`, populated by Gemini only when the scan
  // ran in Thai mode. The English `signal` is always kept because the
  // Hallmark landmark matcher keys off English `signalKeywords`; the UI
  // shows `signalTh` (falling back to `signal`) when lang === 'th'.
  signalTh?: string;
  weight: 'positive' | 'negative' | 'neutral';
  // Optional 0-10 conformity score for this checkpoint (10 = matches an
  // authentic example, 0 = clear counterfeit marker). Display-only — does not
  // affect the verdict math. Undefined for older payloads / unscored signals.
  score?: number;
};

export type PriceByGrade = {
  excellent: number; // Perfect/Mint condition
  good: number;      // Light wear
  fair: number;      // Moderate wear/Scratches
};

export type PriceSource = {
  url: string;
  title: string;       // Web page title
  priceFound?: string; // Price found on that page (if any)
};

export type ReproductionPrice = {
  typical: number;                  // Most typical price for counterfeits
  range: { min: number; max: number };
  notes: string;                    // e.g., "typical rep street price"
};

// AI Authenticity Heatmap — Gemini boxes 3-7 specific regions on the USER's
// actual photo (crown, rehaut, cyclops, dial text, date, clasp...), each with a
// green/yellow/red signal + observation/reasoning. Explainable visual layer;
// NOT a certification. (Render via PhotoHeatmap; generated on-demand.)
export type HeatmapSignal = 'green' | 'yellow' | 'red';
export type HeatmapRegion = {
  // Gemini bbox, normalized 0..1000: [ymin, xmin, ymax, xmax].
  box: { ymin: number; xmin: number; ymax: number; xmax: number };
  type: HeatmapSignal;
  feature: string;       // short label, e.g. "มงกุฎ" / "Rehaut"
  observation: string;   // what AI sees at that spot (1 sentence)
  reasoning: string;     // why it matters for authenticity (1-2 sentences)
};
export type HeatmapResult = {
  regions: HeatmapRegion[];
  overallNote: string;
  counts: { green: number; yellow: number; red: number };
};

export type ScanResult = {
  identified: boolean;
  confidence: number;               // Confidence in "identification" (not authenticity)
  name: string;
  brand: string;
  reference: string;
  movementFamily: string;           // movement / calibre family
  caseMaterial: string;             // case metal/material
  year: string;
  type: string;
  description: string;

  // Resale prices in USD
  marketPrice: number;
  priceRangeUSD: { min: number; max: number };
  priceByGrade: PriceByGrade;
  priceNotes: string;
  priceSources: PriceSource[];
  priceDataFreshness: 'live' | 'training' | 'mixed';

  // Authenticity assessment
  authenticityProbability?: number; // 0-100 — Chance of being authentic
  authenticityVerdict?: 'likely-authentic' | 'uncertain' | 'likely-reproduction' | 'cannot-assess';
  authenticityReasoning?: string;   // Reason for the verdict
  serialNumber?: string;            // Serial/ref engraving read from a photo (only if legible; never guessed)

  // Serial-number screening (src/lib/data/serialValidation.ts) — ASYMMETRIC,
  // flag-only. L1 format + L2 production-era cross-check on the photo-read
  // serial. A clean serial does NOT confirm authenticity (fakes copy serials);
  // only a format-suspect / era-mismatch result carries a penalty. Replaces the
  // weight-input AI-Data Fusion as the primary physical-evidence signal.
  serialCheck?: SerialCheck;

  // Set by the macro-coverage gate in aiRouter when the scan had
  // fewer than 4 photos and the raw verdict would otherwise have
  // claimed > 70% confidence. ResultScreen renders a "Limited
  // photo coverage" banner + add-macro-photos CTA when this is
  // true. Not persisted to DB — derived per-scan.
  macroCoverageWarning?: boolean;
  // The confidence ceiling the macro-coverage gate applied (70 for ≤2 photos,
  // 85 for 3). Lets the UI banner show the ACTUAL cap rather than a hardcoded
  // number — the post-cap classifier penalty can lower authenticityProbability
  // below the cap, so that field isn't a reliable stand-in. Undefined when no
  // cap fired (4+ photos).
  macroCoverageCap?: number;

  // AI-Data Fusion: weight-discrepancy signal. Populated by aiRouter
  // when the user provided a measured weight AND a spec exists for
  // the identified reference. Drives a red "🚩 น้ำหนักไม่ตรงสเปก"
  // banner on ResultScreen when grade === 'mismatch'.
  weightCheck?: {
    userWeightG: number;
    nominalG: number;
    minG: number;
    maxG: number;
    material: string;
    grade: 'match' | 'slight' | 'mismatch';
    deltaG: number;
    // Bilingual override message — populated only when grade ===
    // 'mismatch' and a verdict override fired. UI renders the lang-
    // appropriate version. Keeping these structured (rather than
    // prepending raw English to authenticityReasoning) lets the
    // localisation system handle them correctly and keeps the
    // Gemini-authored reasoning untouched for downstream consumers
    // (e.g. PDF export).
    overrideMessage?: { th: string; en: string };
  };

  // Reproduction/fake price bands
  reproductionPrice?: ReproductionPrice;

  authenticitySignals: AuthenticitySignal[];
  checklist: string[];
  recommendation: string;
  warningFlags: string[];

  // Price cache provenance
  priceFromCache?: boolean;
  priceFetchedAt?: string; // ISO timestamp of when prices were fetched

  // Alternate guesses
  alternateNames?: string[];

  // Expert certificate exemplar match
  expertCertMatch?: {
    certId: string;
    watchName: string;
    watchReference: string | null;
    brand: string | null;
    certUrl: string;
    distance: number; // cosine — lower = stronger match
  };

  // Main watch-DB (image_embeddings, 30k) corroboration — set when DINOv3
  // visual similarity agrees with the identified brand+model. Drives the
  // result UI's "Reference DB Match" field.
  visualDbMatch?: {
    name: string;
    brand: string;
    reference: string;
    similarity: number; // 0..1, higher = stronger
  };

  // Google Vision Web Detection — second opinion
  visionWebSuggestions?: {
    bestGuess?: string;
    entities: string[];
    pageTitles: string[];
  };

  // Watch dial bounding box for automatic cropping
  watchBbox?: {
    x: number;       // left edge, 0-1
    y: number;       // top edge, 0-1
    width: number;   // 0-1
    height: number;  // 0-1
  };

  crossValidation?: any;
  heatmap?: any;
};

export type SavedWatch = {
  id: string;
  savedAt: string; // ISO date
  result: ScanResult;
  frontUri: string; // permanent file URI (original)
  backUri?: string;
  notes?: string;
  purchasePrice?: number;
  customName?: string; // user-edited display name; falls back to result.name
  customPrice?: number; // shop/owner asking price
  categoryId?: string;
  processedFrontUri?: string;
  bgColor?: string; // hex
  galleryImages?: string[];
  soldAt?: string;       // ISO date of sale
  soldPrice?: number;    // received from buyer
  soldTo?: string;       // optional buyer name
  soldNotes?: string;
};

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Onboarding: undefined;
  Main: undefined;
  Home: undefined;
  Scan: undefined;
  Loading: {
    frontUri: string;
    backUri?: string;
    extraImages?: string[];
    // Parallel to extraImages — each entry labels what that macro shot is
    // ('crown' | 'clasp'), so the auth prompt can direct Gemini per image.
    extraImageRoles?: string[];
  };
  Result: {
    result: ScanResult;
    // Example mode — a curated, READ-ONLY showcase (no AI, no Save). When true,
    // ResultScreen renders `exampleImage` as the hero and swaps Save → upgrade CTA.
    isExample?: boolean;
    exampleImage?: any; // bundled require() hero image (resolved via Image.resolveAssetSource)
    frontUri: string;
    backUri?: string;
    savedId?: string; // present when viewing from Collection
    processedFrontUri?: string;
    bgColor?: string;
    customName?: string;
    customPrice?: number;
    purchasePrice?: number;
    notes?: string;
    categoryId?: string;
    galleryImages?: string[];
    soldAt?: string;
    soldPrice?: number;
    soldTo?: string;
    soldNotes?: string;
  };
  Collection: undefined;
  Portfolio: undefined;
  Info: { kind: 'faq' | 'terms' | 'privacy' | 'contact' | 'guide' };
  Settings: undefined;
  // `trigger` records WHY the paywall opened — used by MembershipScreen
  // to fire paywall_viewed with attribution. Falls back to 'unknown' if
  // omitted (legacy callers).
  Membership: { trigger?: string } | undefined;
  Game: undefined;
  // NOTE: 19 "Phase 2" stub routes (RefCompare, ResultDetail, Profile,
  // Subscription alias, AuthGuide, …) were removed 2026-06-10 — they all
  // rendered the same DummyScreen dead end and only one was even reachable.
  // Re-add a route here when its real screen ships.
};
