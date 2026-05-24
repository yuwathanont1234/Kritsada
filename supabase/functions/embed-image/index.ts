// Supabase Edge Function: embed-image
// Secure serverless boundary that turns an image into a 1024-dim DINOv3 vector.
// The DINOv3 model + key never leave the server; the app only sees the vector.
//
// Request:  { "image_b64": "<base64>", "content_type": "image/jpeg" }
// Response: { "embedding": number[1024] }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SHARED_SECRET = Deno.env.get("EMBED_FUNCTION_SECRET")!;
const DINOV3_ENDPOINT = Deno.env.get("DINOV3_ENDPOINT")!;
const DINOV3_API_KEY = Deno.env.get("DINOV3_API_KEY")!;
const EXPECTED_DIM = 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (req.headers.get("x-embed-secret") !== SHARED_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: { image_b64?: string; content_type?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!payload.image_b64) return json({ error: "image_b64 required" }, 400);

  const bytes = Uint8Array.from(atob(payload.image_b64), (c) => c.charCodeAt(0));

  // Forward to the DINOv3 inference backend.
  const upstream = await fetch(DINOV3_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": payload.content_type ?? "application/octet-stream",
      "authorization": `Bearer ${DINOV3_API_KEY}`,
    },
    body: bytes,
  });

  if (!upstream.ok) {
    return json({ error: `dinov3 backend ${upstream.status}` }, 502);
  }

  const data = await upstream.json();
  const embedding: number[] = data.embedding ?? data;
  if (!Array.isArray(embedding) || embedding.length !== EXPECTED_DIM) {
    return json(
      { error: `expected ${EXPECTED_DIM}-dim embedding, got ${embedding?.length}` },
      502,
    );
  }

  return json({ embedding });
});
