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

  try {
    const body = await req.json()
    const image = body?.image
    const imgLen = typeof image === 'string' ? image.length : 0
    console.log(`[embed-image:${reqId}] received: imgLen=${imgLen} (${(imgLen / 1024).toFixed(1)}KB) hasImage=${!!image}`)

    if (!image) {
      console.error(`[embed-image:${reqId}] FAIL: missing image in body. keys=${Object.keys(body || {}).join(',')}`)
      return new Response(
        JSON.stringify({ error: "Missing 'image' in request body" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    const tPost = Date.now()
    const response = await fetch("https://api.replicate.com/v1/predictions", {
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
    })
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

    // Poll until succeeded
    let polls = 0
    const maxPolls = 90
    while (
      (prediction.status === "starting" || prediction.status === "processing") &&
      polls < maxPolls
    ) {
      polls += 1
      await new Promise((r) => setTimeout(r, 800))
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      prediction = await pollRes.json()
      console.log(`[embed-image:${reqId}] poll #${polls}/${maxPolls}: status=${prediction.status}`)
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
