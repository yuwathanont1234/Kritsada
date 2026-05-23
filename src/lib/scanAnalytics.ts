/**
 * Scan Analytics — anonymous logging of scan events for the data flywheel.
 *
 * Privacy posture (matches dataConsent.ts):
 *   • NO personal identifiers ever sent.
 *   • Only fires if user has opted in via dataConsent.grantDataConsent().
 *   • Uses cohort_hash (random per-install) to dedupe spam, NOT identify.
 *
 * Failure mode: best-effort fire-and-forget. If logging fails (network, etc.)
 * the user's scan still succeeds — we never block UX on telemetry.
 */
import { getDataConsent } from './dataConsent';
import type { ScanResult } from './types';
import type { MembershipTier } from './auth';
import type { SimilarWatch } from './visualRag';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const APP_VERSION =
  process.env.EXPO_PUBLIC_APP_VERSION ||
  process.env.APP_VERSION ||
  '1.0.0';

// Threshold used to flag a Visual-RAG / AI mismatch as suspicious.
const MISMATCH_AI_CONFIDENCE = 75;
const MISMATCH_VRAG_THRESHOLD = 0.55;

export type LogScanInput = {
  result: ScanResult;
  visualCandidates?: SimilarWatch[];
  /** True if Phase 1C grounded search ran (regardless of whether it helped) */
  usedGroundedFallback?: boolean;
  tier: MembershipTier;
};

function isConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/**
 * Log a single scan event. Fire-and-forget — never throws, never awaited
 * by the scan flow. Returns true iff the event was sent (false on opt-out
 * or any error).
 */
export async function logScanEvent(input: LogScanInput): Promise<boolean> {
  if (!isConfigured()) return false;

  // Privacy gate: only log if user opted in
  const consent = await getDataConsent();
  if (!consent.granted || !consent.cohortHash) return false;

  const { result, visualCandidates, usedGroundedFallback, tier } = input;

  // Compute Visual RAG mismatch flag — top similarity vs AI confidence
  const topSim = visualCandidates?.[0]?.similarity ?? null;
  const topId = visualCandidates?.[0]?.id ?? null;
  const aiConfidence = result.confidence ?? 0;
  const visualRagMismatch =
    aiConfidence >= MISMATCH_AI_CONFIDENCE &&
    topSim !== null &&
    topSim < MISMATCH_VRAG_THRESHOLD;

  const payload = {
    cohort_hash: consent.cohortHash,
    watch_brand: result.brand || null,
    watch_reference: result.expertCertMatch?.watchReference || result.name || null,
    watch_name: result.name || null,
    confidence: typeof result.confidence === 'number' ? Math.round(result.confidence) : null,
    identified: !!result.identified,
    visual_rag_top_id: topId,
    visual_rag_top_sim: topSim,
    visual_rag_mismatch: visualRagMismatch,
    tier,
    event_type: 'scan',
    path_taken: usedGroundedFallback ? 'gemini-grounded' : 'standard',
    app_version: APP_VERSION,
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scan_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn('[scanAnalytics] log failed', res.status);
      return false;
    }
    return true;
  } catch (e: any) {
    // Network errors are non-fatal — telemetry must never block the scan UX
    console.warn('[scanAnalytics] log network error:', e?.message);
    return false;
  }
}
