import { ScanResult } from './types';

export type AuthPayload = {
  authenticityProbability: number;
  authenticityVerdict:
    | 'likely-authentic'
    | 'uncertain'
    | 'likely-reproduction'
    | 'cannot-assess';
  authenticityReasoning: string;
  // Serial/reference engraving read from a photo — undefined unless clearly
  // legible. Gemini is instructed never to guess one (see WATCH_AUTH_SYSTEM_PROMPT).
  serialNumber?: string;
  authenticitySignals: { signal: string; weight: 'positive' | 'negative' | 'neutral'; score?: number }[];
  checklist: string[];
  reproductionPrice: {
    typical: number;
    range: { min: number; max: number };
    notes: string;
  };
  recommendation: string;
  warningFlags: string[];
};

export type PricePayload = {
  marketPrice: number;
  priceRangeUSD: { min: number; max: number };
  priceByGrade: { excellent: number; good: number; fair: number };
  priceNotes: string;
  priceSources: { url: string; title: string; priceFound?: string }[];
  priceDataFreshness: 'live' | 'training' | 'mixed';
};

// Watch models where AI is consistently overconfident on shape/style alone
// without a verifiable reference number or visual hallmarks.
// Capped at 65% when identified purely by shape/style, pushing users to verify
// or select alternates.
const AMBIGUOUS_WATCH_PATTERNS = [
  'Datejust',
  'Submariner',
  'Speedmaster',
  'Seamaster',
  'Santos',
  'Royal Oak',
  'Oyster Perpetual',
  'Day-Date',
  'Carrera',
  'Monaco',
  'Aquaracer',
  'Formula 1',
  'Tank',
  'Chronomat',
  'Navitimer',
  'Black Bay',
  'Speedy',
  'GMT-Master',
  'Aquanaut',
  'Calatrava',
  'Luminor',
  'Radiomir',
  'Submersible',
];

const AMBIGUOUS_MAX_CONFIDENCE = 65;

export function calibrateConfidenceForAmbiguous(
  name: string,
  type: string,
  confidence: number
): number {
  if (!name && !type) return confidence;
  const haystack = `${name} ${type}`.toLowerCase();
  
  // Look for any ambiguous watch models
  const matchedPattern = AMBIGUOUS_WATCH_PATTERNS.find((p) =>
    haystack.includes(p.toLowerCase())
  );
  
  if (!matchedPattern) return confidence;

  // Let's check if there is an explicit reference number (e.g. 116500LN, 15202ST, etc.)
  // Usually, a specific reference number has letters/numbers or 5+ digit codes.
  // If a reference number is detected, we do not cap the confidence.
  const hasRefNumber = /\b\d{4,6}[a-z]{0,4}\b/i.test(haystack) || /\b[a-z]{2,4}\d{4,6}\b/i.test(haystack);
  if (hasRefNumber) return confidence;

  const capped = Math.min(confidence, AMBIGUOUS_MAX_CONFIDENCE);
  if (capped < confidence) {
    console.log(
      `[ai] ambiguous-cap: ${confidence} → ${capped} (model~"${matchedPattern}" without explicit ref)`
    );
  }
  return capped;
}

// Reject non-serials the model might still emit despite the "return null"
// instruction: literal "null"/"none"/"n/a", Thai "not found" phrasings, empty
// strings, or absurdly short tokens. Returns undefined unless it looks like a
// real engraving (≥4 alphanumerics).
function normalizeSerial(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  const lower = s.toLowerCase();
  const rejects = ['null', 'none', 'n/a', 'na', 'unknown', 'not visible', 'not legible', 'ตรวจไม่พบ', 'ไม่พบ', 'ไม่ระบุ', '-', '—'];
  if (rejects.some((r) => lower === r || lower.includes(r))) return undefined;
  if (s.replace(/[^a-z0-9]/gi, '').length < 4) return undefined;
  return s;
}

export function fillScanResultDefaults(partial: any): ScanResult {
  // Handle snake_case translations from AI payload to camelCase ScanResult fields
  const name = partial.name ?? '';
  const brand = partial.brand ?? '';
  const reference = partial.reference ?? partial.reference_number ?? '';
  const movementFamily = partial.movementFamily ?? partial.movement_family ?? '';
  const caseMaterial = partial.caseMaterial ?? partial.case_material ?? '';
  const year = partial.year ?? partial.year_created ?? '';
  const type = partial.type ?? '';
  const description = partial.description ?? '';

  const calibratedConfidence = calibrateConfidenceForAmbiguous(
    name,
    type,
    partial.confidence ?? 0
  );

  // Price range translation
  let priceRangeUSD = { min: 0, max: 0 };
  if (partial.priceRangeUSD) {
    priceRangeUSD = {
      min: partial.priceRangeUSD.min ?? 0,
      max: partial.priceRangeUSD.max ?? 0,
    };
  } else if (partial.priceRangeUsd) {
    priceRangeUSD = {
      min: partial.priceRangeUsd.min ?? 0,
      max: partial.priceRangeUsd.max ?? 0,
    };
  } else if (partial.price_range_usd) {
    priceRangeUSD = {
      min: partial.price_range_usd.min ?? 0,
      max: partial.price_range_usd.max ?? 0,
    };
  }

  // Price by grade translation
  let priceByGrade = { excellent: 0, good: 0, fair: 0 };
  if (partial.priceByGrade) {
    priceByGrade = {
      excellent: partial.priceByGrade.excellent ?? 0,
      good: partial.priceByGrade.good ?? 0,
      fair: partial.priceByGrade.fair ?? 0,
    };
  } else if (partial.price_by_grade) {
    priceByGrade = {
      excellent: partial.price_by_grade.excellent ?? 0,
      good: partial.price_by_grade.good ?? 0,
      fair: partial.price_by_grade.fair ?? 0,
    };
  }

  // Reproduction price translation
  let reproductionPrice: any = undefined;
  if (partial.reproductionPrice) {
    reproductionPrice = {
      typical: partial.reproductionPrice.typical ?? 0,
      range: partial.reproductionPrice.range ?? { min: 0, max: 0 },
      notes: partial.reproductionPrice.notes ?? '',
    };
  } else if (partial.reproduction_price) {
    reproductionPrice = {
      typical: partial.reproduction_price.typical ?? 0,
      range: partial.reproduction_price.range ?? { min: 0, max: 0 },
      notes: partial.reproduction_price.notes ?? '',
    };
  }

  // Watch bbox translation
  let watchBbox: any = undefined;
  if (partial.watchBbox) {
    watchBbox = {
      x: partial.watchBbox.x ?? 0,
      y: partial.watchBbox.y ?? 0,
      width: partial.watchBbox.width ?? 0,
      height: partial.watchBbox.height ?? 0,
    };
  } else if (partial.watch_bbox) {
    watchBbox = {
      x: partial.watch_bbox.x ?? 0,
      y: partial.watch_bbox.y ?? 0,
      width: partial.watch_bbox.width ?? 0,
      height: partial.watch_bbox.height ?? 0,
    };
  }

  return {
    identified: partial.identified ?? false,
    confidence: calibratedConfidence,
    name,
    brand,
    reference,
    movementFamily,
    caseMaterial,
    year,
    type,
    description,
    marketPrice: partial.marketPrice ?? partial.market_price ?? 0,
    priceRangeUSD,
    priceByGrade,
    priceNotes: partial.priceNotes ?? partial.price_notes ?? '',
    priceSources: partial.priceSources ?? partial.price_sources ?? [],
    priceDataFreshness: partial.priceDataFreshness ?? partial.price_data_freshness ?? 'training',
    authenticityProbability: partial.authenticityProbability ?? partial.authenticity_probability,
    authenticityVerdict: partial.authenticityVerdict ?? partial.authenticity_verdict,
    authenticityReasoning: partial.authenticityReasoning ?? partial.authenticity_reasoning,
    serialNumber: normalizeSerial(partial.serialNumber ?? partial.serial_number),
    reproductionPrice,
    // Passes through any per-signal `score` (0-10) the model attached.
    authenticitySignals: partial.authenticitySignals ?? partial.authenticity_signals ?? [],
    checklist: partial.checklist ?? [],
    recommendation: partial.recommendation ?? '',
    warningFlags: partial.warningFlags ?? partial.warning_flags ?? [],
    priceFromCache: partial.priceFromCache ?? partial.price_from_cache,
    priceFetchedAt: partial.priceFetchedAt ?? partial.price_fetched_at,
    alternateNames: partial.alternateNames ?? partial.alternate_names,
    expertCertMatch: partial.expertCertMatch ?? partial.expert_cert_match,
    visionWebSuggestions: partial.visionWebSuggestions ?? partial.vision_web_suggestions,
    watchBbox,
    crossValidation: partial.crossValidation ?? partial.cross_validation,
    heatmap: partial.heatmap,
  };
}
