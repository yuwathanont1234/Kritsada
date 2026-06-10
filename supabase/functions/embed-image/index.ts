import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  const t0 = Date.now()
  const reqId = crypto.randomUUID().slice(0, 8)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Edge-wide budget — keeps total wallclock under Supabase's 60s
  // hard cap with headroom for response serialization. If we approach
  // this we bail out with a clean 504 rather than letting the platform
  // kill the function (which surfaces as a generic 503 to the client).
  const EDGE_BUDGET_MS = 55000
  const edgeDeadline = Date.now() + EDGE_BUDGET_MS

  try {
    const body = await req.json()
    const image = body?.image
    // Keep-warm pings set warmOnly — they only need to BOOT Replicate, not get
    // an embedding back. See the warm-only branch below.
    const warmOnly = body?.warmOnly === true
    const deviceId = body?.deviceId  // telemetry only — never a quota key (client-minted)
    const imgLen = typeof image === 'string' ? image.length : 0
    console.log(`[embed-image:${reqId}] received: imgLen=${imgLen} (${(imgLen / 1024).toFixed(1)}KB) hasImage=${!!image}`)

    if (!image) {
      console.error(`[embed-image:${reqId}] FAIL: missing image in body. keys=${Object.keys(body || {}).join(',')}`)
      return new Response(
        JSON.stringify({ error: "Missing 'image' in request body" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Payload size cap — base64 strings above ~8MB would OOM the Deno
    // isolate without warning. A 384×384 JPEG @ 0.85 quality is ~50KB
    // (~67KB base64). Anything beyond 5MB base64 (~3.7MB binary) is
    // suspicious and almost certainly an unscaled photo from the
    // gallery. Reject early instead of crashing the worker.
    const MAX_BASE64_BYTES = 5 * 1024 * 1024
    if (imgLen > MAX_BASE64_BYTES) {
      console.warn(`[embed-image:${reqId}] REJECT: payload too large (${(imgLen / 1024 / 1024).toFixed(1)}MB > ${MAX_BASE64_BYTES / 1024 / 1024}MB)`)
      return new Response(
        JSON.stringify({ error: `Image payload too large (${(imgLen / 1024 / 1024).toFixed(1)}MB). Resize to ≤${MAX_BASE64_BYTES / 1024 / 1024}MB base64 before sending.` }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = Deno.env.get("REPLICATE_API_TOKEN")
    if (!token) {
      console.error(`[embed-image:${reqId}] FAIL: REPLICATE_API_TOKEN env var missing`)
      return new Response(
        JSON.stringify({ error: "REPLICATE_API_TOKEN is not configured on the server" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    console.log(`[embed-image:${reqId}] token present (len=${token.length})`)

    const version = Deno.env.get("REPLICATE_EMBED_MODEL") || "1dcb6b130ac6ae0574282178705d0e219526ac6d9276c93eda065dfaacae772f"
    console.log(`[embed-image:${reqId}] model version=${version.slice(0, 12)}...`)

    // ── Caller identity (server-derived — NEVER from the request body) ─────
    // Same scheme as analyze-watch: verified JWT `sub`, IP fallback. The
    // service-role key (pg_cron keep-warm, internal tooling) is recognized by
    // exact match and bypasses per-caller caps — its cadence is fixed by the
    // cron schedule, not user-controllable.
    const authHeader = req.headers.get('authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ''
    const isServiceCaller = !!jwt && !!serviceKey && jwt === serviceKey
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim()
    let admin: any = null
    let userId: string | null = null
    try {
      const qUrl = Deno.env.get("SUPABASE_URL")
      if (qUrl && serviceKey) {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2")
        admin = createClient(qUrl, serviceKey)
        if (jwt && !isServiceCaller) {
          const { data: u } = await admin.auth.getUser(jwt)
          userId = u?.user?.id ?? null
        }
      }
    } catch (_e) { /* identity is best-effort; the caps below fail open */ }
    const quotaKey = userId ? `u:${userId}` : (ip ? `ip:${ip}` : "")

    // ── Keep-warm fast path (create-and-forget) ──────────────────────────
    // Real scans use Prefer:wait + polling to GET the embedding back, which on
    // a cold start (30-90s) exceeds the 60s edge cap → the function is killed
    // and it's unreliable whether the model actually finished warming.
    //
    // Keep-warm pings don't need the embedding — they only need to TRIGGER a
    // boot. So create the prediction WITHOUT Prefer:wait and return immediately:
    // the create returns in <1s, and Replicate boots an instance + runs the
    // prediction to completion server-side (nothing aborts it), reliably warming
    // the model. We never read the result.
    if (warmOnly) {
      // warmOnly creates BILL Replicate (each create boots and runs an
      // instance) — previously this branch ran BEFORE any quota check, so
      // anyone holding the public anon key had unbounded Replicate spend.
      // The service-role caller (pg_cron keep-warm, ~288 pings/day) bypasses
      // the cap; every other caller gets a tight dedicated daily budget.
      if (!isServiceCaller && admin && quotaKey) {
        try {
          const WARM_DAILY_CAP = Number(Deno.env.get("WARM_DAILY_CAP") ?? "60")
          const { data: q } = await admin.rpc("consume_edge_quota", {
            p_device_id: `warm:${quotaKey}`,
            p_cap: WARM_DAILY_CAP,
          })
          const row = Array.isArray(q) ? q[0] : q
          if (row && row.allowed === false) {
            console.warn(`[embed-image:${reqId}] warmOnly quota exceeded key=${quotaKey.slice(0, 14)} used=${row.used}/${row.cap}`)
            return new Response(
              JSON.stringify({ warmOnly: true, accepted: false, error: "warm quota exceeded" }),
              { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        } catch (_e) { /* fail-open */ }
      }
      const tWarm = Date.now()
      let pid: string | undefined
      let createStatus = 0
      try {
        const r = await fetch("https://api.replicate.com/v1/predictions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            // NOTE: deliberately NO `Prefer: wait` — fire-and-forget create.
          },
          body: JSON.stringify({ version, input: { image, inputs: image } }),
          // A create (no wait) returns in <1s even when the model is cold; cap
          // generously so a congested network still records a result.
          signal: AbortSignal.timeout(15000),
        })
        createStatus = r.status
        const txt = await r.text().catch(() => '')
        try { pid = JSON.parse(txt)?.id } catch { /* non-JSON — ignore */ }
        console.log(`[embed-image:${reqId}] warmOnly create status=${createStatus} id=${pid?.slice(0, 8) ?? '?'} in ${Date.now() - tWarm}ms`)
      } catch (e: any) {
        console.warn(`[embed-image:${reqId}] warmOnly create failed: ${e?.name ?? ''} ${e?.message ?? e}`)
      }
      // 200 when Replicate accepted the create (prediction now booting → model
      // will warm). 502 only if the create itself failed.
      const ok = createStatus >= 200 && createStatus < 300
      return new Response(
        JSON.stringify({ warmOnly: true, accepted: ok, predictionId: pid ?? null }),
        { status: ok ? 200 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Per-caller daily cap + GLOBAL call ceiling (real embeds) ───────────
    // Same caps as analyze-watch, keyed on the server-derived identity
    // (JWT sub / IP — never the client-minted body deviceId). Fail-OPEN on
    // RPC errors; the caps themselves always block when exceeded.
    if (!isServiceCaller && admin && quotaKey) {
      try {
        const DEVICE_DAILY_CAP = Number(Deno.env.get("EDGE_DEVICE_DAILY_CAP") ?? "400")
        const { data: q, error: qErr } = await admin.rpc("consume_edge_quota", {
          p_device_id: quotaKey,
          p_cap: DEVICE_DAILY_CAP,
        })
        const row = Array.isArray(q) ? q[0] : q
        if (!qErr && row && row.allowed === false) {
          console.warn(`[embed-image:${reqId}] caller quota exceeded key=${quotaKey.slice(0, 14)} used=${row.used}/${row.cap} clientDevice=${typeof deviceId === "string" ? deviceId.slice(0, 10) : "-"}`)
          return new Response(
            JSON.stringify({ error: "ใช้สแกนครบโควต้าสูงสุดของอุปกรณ์นี้แล้ว กรุณาลองใหม่พรุ่งนี้หรืออัปเกรดสมาชิก", quotaExceeded: true }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } catch (_e) { /* fail-open */ }
      try {
        const GLOBAL_CALL_CAP = Number(Deno.env.get("GLOBAL_DAILY_CALL_CAP") ?? "3000")
        const { data: g, error: gErr } = await admin.rpc("consume_edge_quota", {
          p_device_id: "global:billable-calls",
          p_cap: GLOBAL_CALL_CAP,
        })
        const grow = Array.isArray(g) ? g[0] : g
        if (!gErr && grow && grow.allowed === false) {
          console.warn(`[embed-image:${reqId}] GLOBAL call ceiling hit used=${grow.used}/${grow.cap}`)
          return new Response(
            JSON.stringify({ error: "ระบบมีการใช้งานหนาแน่นผิดปกติ กรุณาลองใหม่ภายหลัง", quotaExceeded: true }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } catch (_e) { /* fail-open */ }
    }

    // Replicate POST — bounded by edge budget. AbortSignal.timeout
    // computes the remaining budget so each fetch can't drag past the
    // 60s edge cap. `Prefer: wait` makes Replicate return inline once
    // the prediction succeeds (saves one round-trip on warm path).
    const tPost = Date.now()
    let response: Response
    try {
      const postBudget = Math.max(1000, edgeDeadline - Date.now())
      response = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          version,
          input: { image, inputs: image },
        }),
        signal: AbortSignal.timeout(postBudget),
      })
    } catch (e: any) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        console.warn(`[embed-image:${reqId}] Replicate POST aborted by edge budget`)
        return new Response(
          JSON.stringify({ error: 'Embedding upstream timed out — Replicate cold-start likely. Retry in 30s.', timeout: true }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      throw e
    }
    console.log(`[embed-image:${reqId}] Replicate POST status=${response.status} in ${Date.now() - tPost}ms`)

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[embed-image:${reqId}] FAIL: Replicate POST non-2xx (${response.status}): ${errText.slice(0, 400)}`)
      return new Response(
        JSON.stringify({ error: `Replicate API error: ${errText}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let prediction = await response.json()
    console.log(`[embed-image:${reqId}] initial prediction: id=${prediction.id?.slice(0, 8)} status=${prediction.status}`)

    // Poll until succeeded — bounded by the edge budget rather than a
    // fixed poll count. Previously: maxPolls=90 × 800ms = 72s which
    // EXCEEDS the 60s Supabase edge timeout, so a cold-start always
    // returned 500 instead of a clean 504 (the platform killed the
    // function mid-poll). Now we stop polling when we have < 1s of
    // edge budget left, leaving room to emit a meaningful timeout
    // response that the client can distinguish from a hard failure.
    let polls = 0
    while (
      (prediction.status === "starting" || prediction.status === "processing")
    ) {
      const remaining = edgeDeadline - Date.now()
      if (remaining < 1500) {
        console.warn(`[embed-image:${reqId}] poll budget exhausted (${remaining}ms left, ${polls} polls done) — bailing with cold-start signal`)
        return new Response(
          JSON.stringify({
            error: `Embedding still ${prediction.status} after ${polls} polls. Replicate cold-start — retry in 30s.`,
            status: prediction.status,
            timeout: true,
          }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      polls += 1
      await new Promise((r) => setTimeout(r, 800))
      try {
        const pollBudget = Math.max(2000, edgeDeadline - Date.now())
        const pollRes = await fetch(
          `https://api.replicate.com/v1/predictions/${prediction.id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(pollBudget),
          }
        )
        prediction = await pollRes.json()
      } catch (e: any) {
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
          console.warn(`[embed-image:${reqId}] poll #${polls} aborted by budget`)
          return new Response(
            JSON.stringify({ error: 'Embedding poll timed out — Replicate slow to respond. Retry in 30s.', timeout: true }),
            { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        throw e
      }
      console.log(`[embed-image:${reqId}] poll #${polls}: status=${prediction.status} (budget left ${edgeDeadline - Date.now()}ms)`)
    }

    if (prediction.status !== "succeeded") {
      console.error(`[embed-image:${reqId}] FAIL: final status=${prediction.status} after ${polls} polls, err=${JSON.stringify(prediction.error)?.slice(0, 300)}`)
      return new Response(
        JSON.stringify({ error: `Embedding prediction did not succeed: ${prediction.error || prediction.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    console.log(`[embed-image:${reqId}] prediction succeeded after ${polls} polls`)

    const output = prediction.output
    let embedding = null

    // Parse standard DINOv3 outputs
    if (Array.isArray(output) && output[0]?.embedding) {
      embedding = output[0].embedding
    } else if (output?.embedding && Array.isArray(output.embedding)) {
      embedding = output.embedding
    } else if (Array.isArray(output) && typeof output[0] === 'number') {
      embedding = output
    } else if (Array.isArray(output)) {
      for (const item of output) {
        if (Array.isArray(item) && typeof item[0] === 'number') {
          embedding = item
          break
        }
      }
    }

    if (!embedding) {
      const outputShape = Array.isArray(output) ? `array(len=${output.length}, item0=${typeof output[0]})` : typeof output
      console.error(`[embed-image:${reqId}] FAIL: could not parse embedding from output shape=${outputShape}`)
      return new Response(
        JSON.stringify({ error: "Could not extract embedding from Replicate model output" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[embed-image:${reqId}] SUCCESS in ${Date.now() - t0}ms, emb dim=${embedding.length}`)
    return new Response(
      JSON.stringify({ embedding }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error(`[embed-image:${reqId}] FAIL: uncaught after ${Date.now() - t0}ms: ${error?.message} | stack=${error?.stack?.slice(0, 400)}`)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
