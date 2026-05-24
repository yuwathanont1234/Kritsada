import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { systemInstruction, parts, enableWebSearch, disableThinking, maxOutputTokens, label } = await req.json()

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

    // By default call Gemini Flash, unless Auth or Price are requested
    const endpoint = label === 'auth' || label === 'price' ? GEMINI_PRO_URL : GEMINI_FLASH_URL

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

    const response = await fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

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
    try {
      // Strip markdown code fences if present
      const cleanedText = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim()
      parsedData = JSON.parse(cleanedText)
    } catch {
      parsedData = { text }
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
