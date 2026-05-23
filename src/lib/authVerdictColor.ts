import type { SavedWatch } from './types';

export type AuthColor = 'green' | 'yellow' | 'red' | null;

export type AuthColorMeta = {
  color: AuthColor;
  /** Source of the verdict for debug / UI tooltip. */
  source: 'gemini_verdict' | 'classifier' | 'none';
  /** Probability-of-real if available (0..1), else null. */
  pReal: number | null;
};

export function getAuthColor(watch: SavedWatch): AuthColor {
  return getAuthColorMeta(watch).color;
}

export function getAuthColorMeta(watch: SavedWatch): AuthColorMeta {
  const result = watch.result;
  const cv = result?.crossValidation;

  // ─── 1. PRIMARY — Gemini's final authenticity verdict ─────────────
  const geminiVerdict = result?.authenticityVerdict;
  if (geminiVerdict) {
    let color: AuthColor = null;
    switch (geminiVerdict) {
      case 'likely-authentic':
        color = 'green';
        break;
      case 'uncertain':
        color = 'yellow';
        break;
      case 'likely-reproduction':
        color = 'red';
        break;
      case 'cannot-assess':
        return { color: null, source: 'gemini_verdict', pReal: null };
    }

    // Downgrade safeguard: if Gemini says authentic but our fake reference DB
    // has a very close match (detected via crossValidation), drop to yellow.
    if (color === 'green' && cv?.fakeVsRealSignal === 'closer_to_fake') {
      color = 'yellow';
    }

    const pReal =
      typeof result?.authenticityProbability === 'number'
        ? Math.max(0, Math.min(1, result.authenticityProbability / 100))
        : (cv?.authClassifier?.pReal as number | undefined) ?? null;

    return { color, source: 'gemini_verdict', pReal };
  }

  if (!cv) return { color: null, source: 'none', pReal: null };

  // ─── 2. FALLBACK — classifier bucket (when verdict missing) ─────────
  const bucket = cv.authClassifier?.bucket as string | undefined;
  const pReal = (cv.authClassifier?.pReal as number | undefined) ?? null;

  if (bucket) {
    let color: AuthColor = null;
    switch (bucket) {
      case 'real_strong':
        color = 'green';
        break;
      case 'real_weak':
      case 'fake_weak':
        color = 'yellow';
        break;
      case 'fake_strong':
        color = 'red';
        break;
    }

    if (color === 'green' && cv.fakeVsRealSignal === 'closer_to_fake') {
      color = 'yellow';
    }

    return { color, source: 'classifier', pReal };
  }

  return { color: null, source: 'none', pReal: null };
}

/**
 * Sort order key for grouping by color: green < yellow < red < null
 * (so default ascending sort gives: authentic first, counterfeit last, unscored at the end).
 */
export function authColorSortKey(c: AuthColor): number {
  switch (c) {
    case 'green':
      return 0;
    case 'yellow':
      return 1;
    case 'red':
      return 2;
    default:
      return 3;
  }
}

/**
 * Whether a watch should contribute to "total collection value" calculations.
 * Counterfeit pieces ('red') are excluded to avoid inflating total assets with fakes.
 */
export function countsTowardValue(watch: SavedWatch): boolean {
  return getAuthColor(watch) !== 'red';
}

/**
 * Partition a list of saved watches into the 4 color buckets.
 */
export function groupByAuthColor<T extends SavedWatch>(
  watches: T[]
): { green: T[]; yellow: T[]; red: T[]; none: T[] } {
  const out = { green: [] as T[], yellow: [] as T[], red: [] as T[], none: [] as T[] };
  for (const w of watches) {
    const c = getAuthColor(w);
    if (c === 'green') out.green.push(w);
    else if (c === 'yellow') out.yellow.push(w);
    else if (c === 'red') out.red.push(w);
    else out.none.push(w);
  }
  return out;
}

/**
 * Theme tokens for rendering badges, ribbons, or tint overlays.
 */
export const AUTH_COLOR_THEME = {
  green: {
    primary: '#22C55E',
    secondary: '#16A34A',
    tint: 'rgba(34, 197, 94, 0.12)',
    label: 'Likely Authentic',
    icon: 'check-circle' as const,
  },
  yellow: {
    primary: '#F59E0B',
    secondary: '#D97706',
    tint: 'rgba(245, 158, 11, 0.12)',
    label: 'Uncertain',
    icon: 'help-circle' as const,
  },
  red: {
    primary: '#EF4444',
    secondary: '#DC2626',
    tint: 'rgba(239, 68, 68, 0.12)',
    label: 'Likely Reproduction',
    icon: 'alert-triangle' as const,
  },
} as const;
