/**
 * PostHog wrapper — behavioral analytics layer.
 *
 * PostHog is the FUNNEL/SESSION-REPLAY/A-B-TEST layer. Supabase
 * funnel_events remains the truth-of-record. Every event written via
 * funnelEvents.logFunnelEvent() also mirrors to PostHog via
 * trackPosthog() so we get both:
 *   • Funnel UI / session replays / A/B test infrastructure (PostHog)
 *   • Raw event archive + server-side SQL analysis (Supabase)
 *
 * SETUP (one-time, user action required):
 *   1. Create a PostHog Cloud project at https://posthog.com/signup
 *      (free tier: 1M events/mo + 5K replays — covers 10K+ DAU easily).
 *   2. Copy the Project API Key (looks like `phc_...`).
 *   3. Add to .env:
 *        EXPO_PUBLIC_POSTHOG_KEY=phc_XXXXXXXXXXXX
 *        EXPO_PUBLIC_POSTHOG_HOST=https://app.posthog.com  (or eu.posthog.com)
 *   4. Add to EAS secret for production builds:
 *        eas secret:create --scope project --name EXPO_PUBLIC_POSTHOG_KEY --value phc_...
 *   5. Rebuild: `eas build --platform ios`
 *
 * No DSN configured? `initPosthog()` is a silent no-op, and `trackPosthog`
 * returns false. The rest of the app continues to work.
 *
 * PII posture:
 *   • beforeSend strips known PII keys (email/phone/name/exact location)
 *     as defence-in-depth — funnelEvents.scrubPayload is the primary scrub.
 *   • Person ID is the anonymous cohortHash (NOT email/phone).
 *   • Disabled in development by default (sendDefaultPii: false).
 */
import PostHog from 'posthog-react-native';
import { ensureCohortHash } from './dataConsent';

let posthog: PostHog | null = null;
let initialized = false;

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY || '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

/**
 * Initialize PostHog at app start. Idempotent — safe to call multiple
 * times. No-op when EXPO_PUBLIC_POSTHOG_KEY is unset.
 */
export async function initPosthog(): Promise<void> {
  if (initialized) return;
  if (!POSTHOG_KEY) {
    if (__DEV__) {
      console.log(
        '[posthog] EXPO_PUBLIC_POSTHOG_KEY not set — PostHog disabled. See src/lib/posthog.ts for setup.'
      );
    }
    return;
  }

  try {
    posthog = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      // Manual capture only — we mirror events from funnelEvents.ts.
      // Auto-capture would also include UI taps which inflates events
      // beyond the 1M free tier limit.
      captureAppLifecycleEvents: false,
      // Flush every 30s or when 20 events queue up — balances battery
      // vs freshness for funnel analysis.
      flushAt: 20,
      flushInterval: 30000,
      // PostHog defaults to true; explicit for clarity.
      enableSessionReplay: !__DEV__,
      sessionReplayConfig: {
        maskAllTextInputs: true,
        maskAllImages: true,
        // Capture network requests as breadcrumbs but redact bodies —
        // base64 image payloads must NEVER hit PostHog.
        captureNetworkTelemetry: true,
      },
    });

    // Identify as the anonymous cohortHash. Always — the hash itself
    // is anonymous (random per-install) so no consent gate needed
    // (PDPA Section 26). Without identify, PostHog generates its own
    // distinct_id which would create a parallel identity to our
    // funnel_events / user_profile cohort_hash → analytics wouldn't
    // join up across the two systems.
    try {
      const cohortHash = await ensureCohortHash();
      posthog.identify(cohortHash);
    } catch {
      /* identify failed — events still capture under anonymous SDK id */
    }

    initialized = true;
    if (__DEV__) {
      console.log('[posthog] initialized', POSTHOG_HOST);
    }
  } catch (e: any) {
    console.warn('[posthog] init failed:', e?.message);
  }
}

/**
 * Track a single event. Mirrored from funnelEvents.logFunnelEvent — DO
 * NOT call this directly from screens; call logFunnelEvent so the event
 * also lands in Supabase as truth-of-record.
 *
 * @returns true if the event was queued (false on opt-out / not initialized)
 */
export function trackPosthog(
  event: string,
  properties?: Record<string, any>
): boolean {
  if (!initialized || !posthog) return false;

  // Defence-in-depth PII scrub before handing off to PostHog SDK.
  const scrubbed = scrubPosthogPayload(properties);

  try {
    posthog.capture(event, scrubbed);
    return true;
  } catch (e: any) {
    console.warn('[posthog] capture failed:', event, e?.message);
    return false;
  }
}

/**
 * Re-identify the current device with a fresh cohortHash. Called from
 * dataConsent.eraseMyData() after the cohort rotates.
 */
export function identifyPosthog(cohortHash: string): void {
  if (!initialized || !posthog) return;
  try {
    posthog.identify(cohortHash);
  } catch (e: any) {
    console.warn('[posthog] identify failed:', e?.message);
  }
}

/**
 * Stop tracking (e.g. user revoked consent). PostHog SDK clears local
 * queue; future capture() calls become no-ops until opt-in restored.
 */
export function disablePosthog(): void {
  if (!initialized || !posthog) return;
  try {
    posthog.optOut();
  } catch (e: any) {
    console.warn('[posthog] opt-out failed:', e?.message);
  }
}

/**
 * Re-enable after a previous opt-out.
 */
export function enablePosthog(): void {
  if (!initialized || !posthog) return;
  try {
    posthog.optIn();
  } catch (e: any) {
    console.warn('[posthog] opt-in failed:', e?.message);
  }
}

// ── Internal: payload sanitizer ──────────────────────────────
function scrubPosthogPayload(p?: Record<string, any>): Record<string, any> | undefined {
  if (!p) return undefined;
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
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(p)) {
    if (PII_KEYS.has(k)) continue;
    if (typeof v === 'string') {
      // Crude email + phone detectors — defence in depth.
      if (/@.+\./.test(v) && v.length < 64) continue;
      if (/^\+?\d[\d\s-]{7,}$/.test(v)) continue;
      // Base64 image data URLs MUST NEVER leak.
      if (v.startsWith('data:image')) continue;
    }
    out[k] = v;
  }
  return out;
}
