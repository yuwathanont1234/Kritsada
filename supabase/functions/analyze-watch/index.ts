import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// NB: @supabase/supabase-js is imported lazily inside persistPriceCache (not at
// module top) so the esm.sh fetch can never slow or break a cold-start of the
// hot request path (identify / auth / price). It only loads when we actually
// write the cache, in the background, after the response is sent.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Persist a fresh price lookup into watch_price_cache.
 *
 * Why this lives server-side: migration 0004 deliberately hardened the table
 * to SELECT-only for the anon role (an anon client could otherwise poison the
 * shared cache with fake prices). The client therefore CANNOT write the cache
 * — its writePriceCache() upsert was silently failing under RLS, so every
 * scan of the same (brand, ref) re-paid the ~฿1.50 grounded price lookup.
 *
 * The edge function runs with the auto-injected SERVICE_ROLE key, which
 * bypasses RLS, so it is the correct place to populate the cache. Best-effort:
 * any failure here must never affect the price response the client receives.
 * Row shape mirrors src/lib/geminiAi.ts writePriceCache() exactly.
 */
async function persistPriceCache(
  key: { brand: string; ref: string },
  payload: any
): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!url || !serviceKey) return
    const brandKey = String(key.brand || '').trim().toLowerCase()
    const refKey = String(key.ref || '').trim().toLowerCase()
    if (!brandKey || !refKey) return

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2")
    const admin = createClient(url, serviceKey)
    const now = new Date()
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // +30 days
    await admin.from('watch_price_cache').upsert(
      {
        brand_key: brandKey,
        ref_key: refKey,
        brand: key.brand,
        ref: key.ref,
        market_price_usd: payload?.marketPrice ?? null,
        price_payload: payload,
        source: 'gemini-grounded',
        cached_at: now.toISOString(),
        expires_at: expires.toISOString(),
      },
      { onConflict: 'brand_key,ref_key' }
    )
  } catch (e: any) {
    console.warn('[analyze-watch:price] cache persist failed:', e?.message)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { systemInstruction, parts, enableWebSearch, disableThinking, maxOutputTokens, label, priceCacheKey } = await req.json()

    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not configured on the server" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const GEMINI_FLASH_MODEL = Deno.env.get("GEMINI_FLASH_MODEL") || 'gemini-3-flash-preview'
    const GEMINI_PRO_MODEL = Deno.env.get("GEMINI_PRO_MODEL") || 'gemini-3.5-flash'
    const GEMINI_FLASH_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH_MODEL}:generateContent`
    const GEMINI_PRO_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_PRO_MODEL}:generateContent`

    // Routing — Pro is ~10× more expensive than Flash per token. Use Pro only
    // where the quality gap is justified:
    //   • price: needs Google-Search grounding for accurate market values
    //   • auth (optional via AUTH_USE_FLASH=false): forensic image analysis
    //
    // IMPORTANT (T5 2026-05 review): both GEMINI_FLASH_MODEL and
    // GEMINI_PRO_MODEL currently default to Flash-family models
    // (gemini-3-flash-preview and gemini-3.5-flash). The "Pro" name
    // is preserved for the env var only — actual cost is Flash-tier
    // either way. If a future env override points GEMINI_PRO_MODEL to
    // a true Pro endpoint (e.g. gemini-3-pro), grounded retries would
    // become 10× more expensive overnight. To prevent silent cost
    // regression, this routing also accepts an explicit
    // FORCE_GROUNDED_TO_FLASH=true env that locks identify-grounded
    // and price endpoints to the Flash URL regardless of model env.
    //
    // Default: route AUTH to Flash (set AUTH_USE_FLASH=false to revert to Pro).
    // Flash 2.5 is strong enough for general authenticity checks (case finish,
    // dial typography, hand alignment) and saves ~$0.025/scan ≈ ฿0.88/scan.
    // For high-end watches we still get accurate verdicts because the heatmap
    // + visualRag + expert-cert layers run independently of model tier.
    const authUseFlash = (Deno.env.get("AUTH_USE_FLASH") ?? "true").toLowerCase() !== "false"
    const forceGroundedToFlash = (Deno.env.get("FORCE_GROUNDED_TO_FLASH") ?? "true").toLowerCase() !== "false"
    let endpoint: string
    if (label === 'price') {
      // Price benefits most from grounded search. Use Flash for cost
      // unless explicitly opted out via FORCE_GROUNDED_TO_FLASH=false.
      endpoint = forceGroundedToFlash ? GEMINI_FLASH_URL : GEMINI_PRO_URL
    } else if (label === 'auth') {
      endpoint = authUseFlash ? GEMINI_FLASH_URL : GEMINI_PRO_URL // tunable via env
    } else if (label === 'identify-grounded') {
      // Grounded identify retry — Flash is sufficient (grounding does
      // the heavy lifting). Explicit to prevent accidental Pro routing.
      endpoint = forceGroundedToFlash ? GEMINI_FLASH_URL : GEMINI_PRO_URL
    } else {
      endpoint = GEMINI_FLASH_URL                                 // identify, default
    }

    const generationConfig: any = {
      temperature: 0.1,
      maxOutputTokens: maxOutputTokens || 16000,
    }
    if (!enableWebSearch) {
      generationConfig.responseMimeType = 'application/json'
    }

    const body: any = {
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig,
    }
    if (enableWebSearch) {
      body.tools = [{ google_search: {} }]
    }

    if (disableThinking && endpoint === GEMINI_FLASH_URL) {
      body.generationConfig.thinkingConfig = { thinkingBudget: 0 }
    }

    // AbortSignal.timeout — Supabase Edge Functions hard-cap requests at
    // 60s wall-clock. A stalled Gemini call (cold path, region outage,
    // long Pro-grounded retrieval) without an explicit timeout will hold
    // a Deno isolate slot until the platform kills the function — by
    // which point the client has already received a generic 503 and
    // moved on. By aborting ourselves at 50s we (a) free the isolate
    // slot proactively, (b) emit a clean 504 with a useful error body,
    // and (c) leave headroom for the JSON parse + response write below.
    //
    // 50s budget chosen because Gemini Flash with thinkingBudget=0
    // normally returns in 1-3s; Pro with grounding 5-15s; even the
    // worst observed scan (cold-start grounded retry) is < 35s. Anything
    // longer is almost certainly a hang, not slow-but-progressing work.
    const GEMINI_TIMEOUT_MS = 50000
    let response: Response
    try {
      response = await fetch(`${endpoint}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      })
    } catch (e: any) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        console.warn(`[analyze-watch:${label}] Gemini fetch aborted after ${GEMINI_TIMEOUT_MS}ms`)
        return new Response(
          JSON.stringify({
            error: `AI upstream timeout after ${GEMINI_TIMEOUT_MS / 1000}s — please retry.`,
            timeout: true,
          }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      // Other transport errors (DNS, TLS, etc.) — surface as 502.
      console.warn(`[analyze-watch:${label}] Gemini fetch failed:`, e?.message)
      return new Response(
        JSON.stringify({ error: `Upstream AI fetch failed: ${e?.message ?? 'unknown'}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!response.ok) {
      const errText = await response.text()
      return new Response(
        JSON.stringify({ error: `Gemini API returned status ${response.status}: ${errText}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      return new Response(
        JSON.stringify({ error: "AI returned empty content" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return parsed json or raw text based on content
    let parsedData = null
    let parsedOk = false
    try {
      // Strip markdown code fences if present
      const cleanedText = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim()
      parsedData = JSON.parse(cleanedText)
      parsedOk = true
    } catch {
      parsedData = { text }
    }

    // Populate the shared price cache server-side (service role). Only when we
    // got a real structured payload — never cache the {text} JSON-parse
    // fallback. Best-effort and awaited only briefly; failures are swallowed
    // inside persistPriceCache so they can't affect the price response.
    if (label === 'price' && parsedOk && priceCacheKey?.brand && priceCacheKey?.ref) {
      // Run the cache write in the BACKGROUND (after the response is sent) so it
      // can never add latency to — or fail — the price response the client is
      // waiting on. EdgeRuntime.waitUntil keeps the isolate alive until it
      // settles; fall back to plain fire-and-forget if the global is absent.
      const writePromise = persistPriceCache(priceCacheKey, parsedData)
      // @ts-ignore — EdgeRuntime is a Supabase Edge global, not in Deno types
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(writePromise)
      } else {
        writePromise.catch(() => {})
      }
    }

    return new Response(
      JSON.stringify(parsedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
