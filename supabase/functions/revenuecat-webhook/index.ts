import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

/**
 * revenuecat-webhook — receives RevenueCat server events and mirrors the
 * user's entitlement into public.user_membership (migration 0016), giving
 * the edge functions a store-validated tier to gate on.
 *
 * SETUP (operator):
 *   1. supabase secrets set RC_WEBHOOK_SECRET=<long random string>
 *   2. RevenueCat dashboard → Integrations → Webhooks:
 *        URL    = https://<project>.functions.supabase.co/revenuecat-webhook
 *        Header = Authorization: Bearer <same RC_WEBHOOK_SECRET>
 *   3. App user IDs must be the Supabase auth UUID (the app passes
 *      session.user.id to Purchases.configure / logIn since 2026-06-10).
 *
 * SECURITY: the only accepted caller is one presenting RC_WEBHOOK_SECRET.
 * With the secret unset the function refuses every request (fail closed) —
 * better no mirror than a forgeable one.
 */

const ENTITLEMENT_RANK: Record<string, number> = {
  premium: 3,
  pro: 2,
  standard: 1,
}

const PRODUCT_TO_TIER: Record<string, string> = {
  lux_std_990: 'standard',
  lux_pro_1990: 'pro',
  lux_premium_4990: 'premium',
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  // ── Auth: shared-secret header, fail closed ──────────────────────────────
  const secret = Deno.env.get('RC_WEBHOOK_SECRET') ?? ''
  const authHeader = req.headers.get('authorization') ?? ''
  const presented = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!secret || presented !== secret) {
    console.warn('[rc-webhook] rejected: bad or missing webhook secret')
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const payload = await req.json()
    const event = payload?.event ?? payload
    const type: string = event?.type ?? 'UNKNOWN'
    const appUserId: string = event?.app_user_id ?? ''

    // RevenueCat anonymous ids ($RCAnonymousID:...) can't be mapped to a
    // Supabase user — acknowledge so RC doesn't retry forever.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appUserId)
    if (!isUuid) {
      console.log(`[rc-webhook] skip type=${type} app_user_id=${appUserId.slice(0, 20)} (not a Supabase UUID)`)
      return new Response(JSON.stringify({ ok: true, skipped: 'non-uuid app_user_id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Resolve the tier this event leaves the user at ────────────────────
    // Preference order: active entitlement_ids → product_id mapping.
    let tier = 'free'
    const entitlements: string[] = Array.isArray(event?.entitlement_ids)
      ? event.entitlement_ids
      : (event?.entitlement_id ? [event.entitlement_id] : [])
    for (const e of entitlements) {
      if ((ENTITLEMENT_RANK[e] ?? 0) > (ENTITLEMENT_RANK[tier] ?? 0)) tier = e
    }
    if (tier === 'free' && typeof event?.product_id === 'string') {
      tier = PRODUCT_TO_TIER[event.product_id] ?? 'free'
    }

    // EXPIRATION ends access. CANCELLATION only turns off auto-renew — the
    // user keeps the tier until expires_at, so we do NOT downgrade on it.
    if (type === 'EXPIRATION') tier = 'free'

    const expiresMs = Number(event?.expiration_at_ms ?? 0)
    const expiresAt = expiresMs > 0 ? new Date(expiresMs).toISOString() : null

    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) {
      console.error('[rc-webhook] missing SUPABASE_URL / SERVICE_ROLE_KEY')
      return new Response(JSON.stringify({ error: 'server misconfigured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const admin = createClient(url, serviceKey)

    const { error } = await admin.from('user_membership').upsert(
      {
        user_id: appUserId,
        tier,
        expires_at: tier === 'free' ? null : expiresAt,
        source: 'revenuecat',
        last_event: type,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    if (error) {
      // Non-200 → RevenueCat retries with backoff, which is what we want for
      // a transient DB error.
      console.error(`[rc-webhook] upsert failed user=${appUserId.slice(0, 8)}: ${error.message}`)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`[rc-webhook] ${type} user=${appUserId.slice(0, 8)} → tier=${tier} expires=${expiresAt ?? '-'}`)
    return new Response(JSON.stringify({ ok: true, tier }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('[rc-webhook] uncaught:', e?.message)
    return new Response(JSON.stringify({ error: e?.message ?? 'bad request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
