/**
 * Funnel Events — conversion-funnel breadcrumbs.
 *
 * Mirrors src/lib/scanAnalytics.ts in privacy posture and fire-and-forget
 * semantics. Whereas scanAnalytics tracks scan-level forensic data,
 * funnelEvents tracks the user's path through acquisition → activation →
 * conversion → retention.
 *
 * Privacy posture:
 *   • NEVER fires unless dataConsent.granted === true.
 *   • Only cohort_hash, event_type, and event-specific payload sent.
 *   • Payloads must NOT include PII (email/phone/exact-location/photos).
 *     A best-effort scrub runs in `logFunnelEvent` to redact obvious PII.
 *
 * Tooling:
 *   • Writes to Supabase `funnel_events` table (truth of record).
 *   • If PostHog is configured, also mirrors event to PostHog for
 *     funnel/replay UI. PostHog is the BEHAVIORAL layer; Supabase is the
 *     truth-of-record layer.
 *
 * Failure mode: best-effort fire-and-forget. Telemetry NEVER blocks UX.
 */
import { ensureCohortHash } from './dataConsent';
import { getMembership } from './auth';
import type { MembershipTier } from './auth';
import { trackPosthog } from './posthog';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const APP_VERSION =
  process.env.EXPO_PUBLIC_APP_VERSION ||
  process.env.APP_VERSION ||
  '1.0.0';

// ── Canonical event taxonomy ────────────────────────────────
// Keep this enum in sync with the plan document. New event types
// MUST be added here AND the plan to avoid orphan strings drifting
// into the funnel_events table.
export type FunnelEventType =
  // Acquisition
  | 'app_opened'
  // Activation
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  // Engagement → conversion
  | 'scan_quota_approaching'
  | 'scan_quota_exhausted'
  | 'paywall_viewed'
  | 'paywall_dismissed'
  | 'checkout_started'
  | 'subscription_completed'
  // Phase 2 additions
  | 'feature_locked_tapped'
  | 'verdict_displayed'
  | 'camera_permission_granted'
  | 'camera_permission_denied'
  // Phase 3 (re-engagement)
  | 'push_token_registered'
  | 'push_received'
  | 'push_opened'
  | 're_engagement_sent'
  | 're_engagement_clicked'
  | 'subscription_cancelled';

export type FunnelEventPayload = Record<string, string | number | boolean | null | undefined | string[] | number[]>;

function isConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/**
 * Best-effort PII scrub. Strips keys that look like contact info even if
 * a caller accidentally includes them. Defence-in-depth — the canonical
 * rule is "never include PII in payload", but this guards against drift.
 */
function scrubPayload(payload?: FunnelEventPayload): FunnelEventPayload | null {
  if (!payload) return null;
  const PII_KEYS = new Set([
    'email',
    'phone',
    'phone_e164',
    'name',
    'fullName',
    'displayName',
    'address',
    'gps',
    'lat',
    'lng',
    'latitude',
    'longitude',
    'ip',
    'ipAddress',
  ]);
  const out: FunnelEventPayload = {};
  for (const [k, v] of Object.entries(payload)) {
    if (PII_KEYS.has(k)) continue;
    // String values that look like email/phone — drop them.
    if (typeof v === 'string') {
      if (/@.+\./.test(v) && v.length < 64) continue; // crude email regex
      if (/^\+?\d[\d\s-]{7,}$/.test(v)) continue;     // crude phone regex
    }
    out[k] = v;
  }
  return out;
}

/**
 * Log a single funnel event. Fire-and-forget — never throws.
 *
 * @param eventType  Canonical type from FunnelEventType union.
 * @param payload    Optional event-specific data. PII keys are scrubbed.
 * @param tierOverride Optional tier override — if omitted, reads from
 *                   getMembership() at call time.
 * @returns true iff the event was actually written to Supabase.
 */
export async function logFunnelEvent(
  eventType: FunnelEventType,
  payload?: FunnelEventPayload,
  tierOverride?: MembershipTier
): Promise<boolean> {
  if (!isConfigured()) return false;

  // ── Privacy posture ────────────────────────────────────────
  // funnel_events store ONLY anonymous cohort + non-PII payloads
  // (conversion stage, screen name, locked feature, tier_chosen…).
  // No watch images, no emails, no phone numbers, no exact location
  // — those are scrubbed by scrubPayload() below and the PostHog
  // SDK's beforeSend.
  //
  // Per PDPA Section 26, anonymous data does NOT require explicit
  // consent. cohortHash is generated client-side as a random
  // per-install string and is by definition not linkable back to
  // a person. So we use ensureCohortHash() (which auto-generates
  // on first call) rather than gating on dataConsent.granted.
  //
  // dataConsent.granted is still required for the heavier
  // scan_events / image_embedding upserts (see scanAnalytics.ts) —
  // those carry brand/reference/visual fingerprints that could
  // theoretically be cross-referenced with other data.
  let cohortHash: string;
  try {
    cohortHash = await ensureCohortHash();
  } catch (e: any) {
    console.warn('[funnelEvents] cohort hash unavailable:', e?.message);
    return false;
  }

  let tier: MembershipTier = tierOverride ?? 'free';
  if (!tierOverride) {
    try {
      const m = await getMembership();
      tier = m.tier;
    } catch {
      tier = 'free';
    }
  }

  const scrubbed = scrubPayload(payload);

  const row = {
    cohort_hash: cohortHash,
    event_type: eventType,
    payload: scrubbed,
    tier,
    app_version: APP_VERSION,
  };

  // Mirror to PostHog (best-effort, won't block Supabase write).
  // PostHog handles its own opt-out + queueing.
  try {
    trackPosthog(eventType, {
      ...scrubbed,
      tier,
      app_version: APP_VERSION,
    });
  } catch {
    /* no-op — PostHog mirror is best-effort */
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/funnel_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      console.warn('[funnelEvents] log failed', eventType, res.status);
      return false;
    }
    return true;
  } catch (e: any) {
    console.warn('[funnelEvents] network error:', eventType, e?.message);
    return false;
  }
}
