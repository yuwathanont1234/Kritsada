/**
 * Cost Circuit Breaker — client-side gate that protects against runaway
 * spend (viral spike, abuse, free-tier overuse).
 *
 * Two responsibilities:
 *   1. **logCostEvent**: append a row to `cost_events` for every billable
 *      AI call (scan / Q&A / heatmap / etc.) in USD. The backend trigger flips
 *      free_tier_paused if the daily budget is breached.
 *   2. **shouldGateFreeTier**: cheap RPC to ask "is the breaker open?".
 *      Called BEFORE expensive operations on Free tier to short-circuit.
 *
 * Failure mode: if the breaker check itself fails (network error, RLS
 * misconfig, etc.) we err on the side of LETTING THE USER PROCEED.
 * Better to risk a few extra cents than to falsely block a paying customer.
 *
 * Cost: each check is extremely cheap.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

function isConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

export type CostEventType =
  | 'scan'           // Gemini scan call (Flash, no grounding)
  | 'scan_grounded'  // Gemini scan call WITH Google Search grounding (billed separately)
  | 'ai_qa'          // Claude/Gemini Q&A
  | 'heatmap'        // AI heatmap generation
  | 'authenticity'   // Authenticity AI deep analysis
  | 'deep_search'    // Visual RAG synthesis
  | 'bg_remove'      // Background removal
  | 'embedding';     // Image embedding

export type CostEvent = {
  type: CostEventType;
  costUsd: number;
  tier?: 'free' | 'standard' | 'pro' | 'premium';
  cohortHash?: string | null;
  cacheHit?: boolean;
};

/**
 * Log a single cost-incurring AI call in USD. Fire-and-forget — never throws.
 * Should be called AFTER the AI call succeeds.
 */
export async function logCostEvent(event: CostEvent): Promise<void> {
  if (!isConfigured()) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/cost_events`;
    await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        event_type: event.type,
        cost_usd: event.costUsd,
        tier: event.tier ?? null,
        cohort_hash: event.cohortHash ?? null,
        cache_hit: event.cacheHit ?? false,
      }),
    });
  } catch (e) {
    console.warn('[costBreaker] logCostEvent failed:', (e as Error).message);
  }
}

/**
 * Check whether we should gate Free-tier AI calls right now. Returns
 * `true` if either:
 *   - Admin has manually paused Free tier
 *   - Daily budget breach (auto-pause kicked in)
 *
 * Defaults to `false` (allow) on any error.
 */
export async function shouldGateFreeTier(): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    const url = `${SUPABASE_URL}/rest/v1/rpc/cost_should_gate_free`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) return false;
    const result = await res.json();
    return result === true;
  } catch (e) {
    console.warn('[costBreaker] gate check failed:', (e as Error).message);
    return false;
  }
}

/**
 * Convenience: if Free user, check the gate. Returns true if the call
 * should proceed, false if it should be blocked.
 */
export async function canProceedAsFree(): Promise<boolean> {
  return !(await shouldGateFreeTier());
}

// ---------------------------------------------------------------------------
// Cost constants in USD — scaled from source THB values (using ~33.3 THB/USD)
// ---------------------------------------------------------------------------
export const COST_PER_CALL = {
  scan: 0.0060,         // ~$0.0060 USD  (Flash identify, no grounding)
  // Grounded identify = Flash + Google Search grounding. Search grounding is
  // billed separately from tokens (~$35 / 1k grounded prompts) so a grounded
  // retry costs roughly 10× a plain scan — ~฿2 (≈$0.060) per call, NOT ฿0.20.
  // Logging it as `scan` under-counted the daily spend and let the cost
  // breaker under-estimate the budget. See aiRouter retryIdentifyWithGoogle.
  scan_grounded: 0.0600, // ~$0.0600 USD  (~฿2 at 33.3 THB/USD)
  ai_qa: 0.0090,        // ~$0.0090 USD
  ai_qa_cached: 0,
  heatmap: 0.0300,      // ~$0.0300 USD
  authenticity: 0.0090, // ~$0.0090 USD
  deep_search: 0.0450,  // ~$0.0450 USD
  bg_remove: 0.0150,    // ~$0.0150 USD
  embedding: 0.0090,    // ~$0.0090 USD
} as const;
