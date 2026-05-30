/**
 * Visual RAG — Image embedding & similarity search for watch identification & authentication.
 *
 * Pipeline:
 *   1. embedImage(uri) → 1024-d vector (DINOv3 via Replicate)
 *   2. applyLinearProbe(vec) → 256-d vector (client-side MLP)
 *   3. findSimilarWatches(vec, k) → top-K watch candidates from Supabase pgvector
 *   4. crossValidateScan(...) → cross-validate matches against expert certs & known fakes
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { applyLinearProbe } from './linearProbe';
import { supabase, USE_EDGE_FUNCTIONS } from './supabase';
import { ensureCohortHash } from './dataConsent';

const REPLICATE_TOKEN = process.env.EXPO_PUBLIC_REPLICATE_API_TOKEN || '';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

function shouldUseProbeV2(): boolean {
  const env = process.env.EXPO_PUBLIC_USE_EMBEDDING_V2;
  if (env === '0' || env === 'false') return false;
  return true; // Standard projection for watches
}

// Default DINOv3 model on Replicate
const EMBED_MODEL_VERSION =
  process.env.EXPO_PUBLIC_REPLICATE_EMBED_MODEL ||
  '1dcb6b130ac6ae0574282178705d0e219526ac6d9276c93eda065dfaacae772f';
const EMBED_DIMENSION = parseInt(
  process.env.EXPO_PUBLIC_REPLICATE_EMBED_DIM || '1024',
  10
);

function extractEmbeddingFromOutput(output: any): number[] | null {
  if (Array.isArray(output) && output[0]?.embedding) {
    return output[0].embedding;
  }
  if (output?.embedding && Array.isArray(output.embedding)) {
    return output.embedding;
  }
  if (Array.isArray(output) && typeof output[0] === 'number') {
    return output;
  }
  if (Array.isArray(output)) {
    for (const item of output) {
      if (Array.isArray(item) && typeof item[0] === 'number') return item;
    }
  }
  return null;
}

export type SimilarWatch = {
  id: string;
  name: string;
  brand: string;
  reference: string;
  imageUrl: string;
  embeddingSource: string;
  similarity: number; // 0..1, higher = more similar
};

export function isVisualRagConfigured(): boolean {
  if (USE_EDGE_FUNCTIONS) {
    return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
  }
  return (
    REPLICATE_TOKEN.length > 0 &&
    SUPABASE_URL.length > 0 &&
    SUPABASE_ANON_KEY.length > 0
  );
}

const PREWARM_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgB//Z';

let prewarmPromise: Promise<void> | null = null;
let lastPrewarmAt = 0;
const PREWARM_COOLDOWN_MS = 10 * 60 * 1000;

export function prewarmReplicate(): void {
  if (!isVisualRagConfigured()) return;
  if (prewarmPromise) return;
  if (Date.now() - lastPrewarmAt < PREWARM_COOLDOWN_MS) return;

  const t0 = Date.now();
  prewarmPromise = (async () => {
    try {
      const { getMembership } = await import('./auth');
      const m = await getMembership();
      if (m.tier === 'free' && !m.isTrialing) {
        console.log(`[visualRag] Replicate prewarm skipped — Free tier`);
        return;
      }
    } catch (e: any) {
      console.warn(`[visualRag] tier lookup failed before prewarm:`, e?.message);
    }

    try {
      await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${REPLICATE_TOKEN}`,
          'Content-Type': 'application/json',
          Prefer: 'wait',
        },
        body: JSON.stringify({
          version: EMBED_MODEL_VERSION,
          input: { image: PREWARM_DATA_URL, inputs: PREWARM_DATA_URL },
        }),
      });
      lastPrewarmAt = Date.now();
      console.log(`[visualRag] Replicate prewarm done in ${Date.now() - t0}ms`);
    } catch (e: any) {
      console.warn(`[visualRag] Replicate prewarm failed (ignored):`, e?.message);
    }
  })().finally(() => {
    prewarmPromise = null;
  });
}

export async function awaitPrewarm(maxMs: number): Promise<void> {
  if (!prewarmPromise) return;
  await Promise.race([
    prewarmPromise,
    new Promise<void>((resolve) => setTimeout(resolve, maxMs)),
  ]);
}

let lastHnswPrewarmAt = 0;
const HNSW_PREWARM_COOLDOWN_MS = 5 * 60 * 1000;

export function prewarmHnsw(): void {
  if (!isVisualRagConfigured()) return;
  if (Date.now() - lastHnswPrewarmAt < HNSW_PREWARM_COOLDOWN_MS) return;

  lastHnswPrewarmAt = Date.now();

  const dummy = new Array(EMBED_DIMENSION).fill(0).map(() => Math.random() - 0.5);
  const sumSq = dummy.reduce((s, v) => s + v * v, 0);
  const norm = Math.sqrt(sumSq);
  const normalized = norm > 0 ? dummy.map((v) => v / norm) : dummy;

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  const body = JSON.stringify({
    query_embedding: normalized,
    match_count: 1,
    max_distance: 2.0,
  });

  const body256 = JSON.stringify({
    query_embedding: normalized.slice(0, 256),
    match_count: 1,
    max_distance: 2.0,
  });

  const t0 = Date.now();
  const warn = (rpc: string) => (e: any) => {
    console.warn(`[visualRag] prewarm ${rpc} failed:`, String(e?.message ?? e).slice(0, 200));
    return null;
  };
  Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/rpc/match_watches_v2`, {
      method: 'POST',
      headers,
      body: body256,
    }).catch(warn('match_watches_v2')),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/match_expert_cert`, {
      method: 'POST',
      headers,
      body,
    }).catch(warn('match_expert_cert')),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/match_fake_embeddings`, {
      method: 'POST',
      headers,
      body,
    }).catch(warn('match_fake_embeddings')),
  ]).then(() => {
    console.log(`[visualRag] HNSW prewarm done in ${Date.now() - t0}ms`);
  });
}

export function prewarmAll(): void {
  prewarmReplicate();
  prewarmHnsw();
}

async function imageToDataUrl(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 384 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!result.base64) throw new Error('แปลงรูปเป็น base64 ไม่สำเร็จ');
  return `data:image/jpeg;base64,${result.base64}`;
}

const embedCache = new Map<string, number[]>();
const EMBED_CACHE_MAX = 20;
const inflightCache = new Map<string, Promise<number[]>>();

export function isEmbeddingCached(frontUri: string, backUri?: string | null): boolean {
  const hasFront = embedCache.has(frontUri);
  if (backUri) {
    return hasFront && embedCache.has(backUri);
  }
  return hasFront;
}

export async function embedImage(uri: string): Promise<number[]> {
  if (!USE_EDGE_FUNCTIONS && !REPLICATE_TOKEN) {
    throw new Error('ยังไม่ได้ตั้งค่า REPLICATE_API_TOKEN');
  }
  const cached = embedCache.get(uri);
  if (cached) {
    console.log(`[visualRag] embedImage cache HIT for ${uri.slice(-30)}`);
    return cached;
  }

  const inflight = inflightCache.get(uri);
  if (inflight) {
    console.log(`[visualRag] embedImage inflight HIT for ${uri.slice(-30)}`);
    return inflight;
  }

  const promise = (async () => {
    try {
      return await embedImageReal(uri);
    } finally {
      inflightCache.delete(uri);
    }
  })();
  inflightCache.set(uri, promise);
  return promise;
}

async function embedImageReal(uri: string): Promise<number[]> {
  const tEncode = Date.now();
  const dataUrl = await imageToDataUrl(uri);
  const encodeMs = Date.now() - tEncode;

  if (USE_EDGE_FUNCTIONS) {
    console.log(`[visualRag:${uri.slice(-15)}] Secure Edge Routing: Calling serverless embed-image backend`);

    // supabase-js wraps non-2xx in a generic FunctionsHttpError whose REAL
    // status + body live on error.context (a Response). The old code swallowed
    // both, so a cold-start 504 was indistinguishable from a 500 token error in
    // the logs. Surface them, and retry ONCE on transient failures (504/5xx/
    // network) — embed-image returns 504 on a Replicate cold-start, which the
    // keep-warm boot usually clears within a few seconds, so a single retry
    // salvages RAG for that scan instead of going blind.
    const MAX_EMBED_RETRIES = 1;
    for (let attempt = 0; attempt <= MAX_EMBED_RETRIES; attempt++) {
      const { data, error } = await supabase.functions.invoke('embed-image', {
        body: { image: dataUrl, deviceId: await ensureCohortHash().catch(() => undefined) }
      });

      if (!error) {
        if (!data || !Array.isArray(data.embedding)) {
          throw new Error('ระบบตรวจสอบภาพส่งข้อมูลรูปแบบไม่ถูกต้อง');
        }
        return data.embedding as number[];
      }

      // Pull the real HTTP status + body off the wrapped Response for diagnosis.
      const ctx = (error as any)?.context;
      const status: number | undefined = ctx?.status;
      let bodyText = '';
      try {
        if (ctx && typeof ctx.text === 'function') bodyText = (await ctx.text())?.slice(0, 200) ?? '';
      } catch { /* body already consumed / not a Response */ }
      const isTransient = !status || status >= 500; // 504 cold-start, 5xx, or network (no status)
      console.warn(
        `[visualRag:edge] embed-image failed (status=${status ?? 'network'}, attempt ${attempt + 1}/${MAX_EMBED_RETRIES + 1}, transient=${isTransient}): ${bodyText || (error as any)?.message || error}`
      );

      if (isTransient && attempt < MAX_EMBED_RETRIES) {
        await new Promise((r) => setTimeout(r, 1500)); // let the cold-start boot finish
        continue;
      }
      throw new Error('ระบบตรวจสอบภาพขัดข้องชั่วคราว (Edge Embed Error) กรุณาลองใหม่อีกครั้ง');
    }
    // unreachable — loop either returns or throws
    throw new Error('ระบบตรวจสอบภาพขัดข้องชั่วคราว (Edge Embed Error) กรุณาลองใหม่อีกครั้ง');
  }

  console.warn(`[SECURITY WARNING] Direct client-side Replicate calls active. Enable Edge Functions in production!`);

  const tCreate = Date.now();
  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REPLICATE_TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({
      version: EMBED_MODEL_VERSION,
      input: { image: dataUrl, inputs: dataUrl },
    }),
  });
  const createMs = Date.now() - tCreate;

  if (!createRes.ok) {
    const txt = await createRes.text();
    throw new Error(`Replicate error ${createRes.status}: ${txt.slice(0, 200)}`);
  }

  let prediction = await createRes.json();

  const tPoll = Date.now();
  let polls = 0;
  while (
    prediction.status === 'starting' ||
    prediction.status === 'processing'
  ) {
    polls += 1;
    await new Promise((r) => setTimeout(r, 800));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` } }
    );
    prediction = await pollRes.json();
  }
  const pollMs = Date.now() - tPoll;

  if (polls > 0) {
    console.log(
      `[visualRag] embed Replicate ${uri.slice(-20)}: encode=${encodeMs}ms ` +
        `create=${createMs}ms poll=${pollMs}ms (${polls} rounds) — cold-start`
    );
  } else {
    console.log(
      `[visualRag] embed Replicate ${uri.slice(-20)}: encode=${encodeMs}ms ` +
        `create=${createMs}ms — warm`
    );
  }

  if (prediction.status !== 'succeeded') {
    throw new Error(
      `Embedding failed: ${prediction.error ?? prediction.status}`
    );
  }

  const vec = extractEmbeddingFromOutput(prediction.output);
  if (!vec) {
    throw new Error(
      `Embedding model returned unexpected format: ${JSON.stringify(prediction.output).slice(0, 200)}`
    );
  }
  if (vec.length !== EMBED_DIMENSION) {
    throw new Error(
      `Expected ${EMBED_DIMENSION}-d vector but got ${vec.length}.`
    );
  }

  const normalized = normalize(vec);
  if (embedCache.size >= EMBED_CACHE_MAX) {
    const firstKey = embedCache.keys().next().value;
    if (firstKey !== undefined) embedCache.delete(firstKey);
  }
  embedCache.set(uri, normalized);
  return normalized;
}

const inflightEnsembleCache = new Map<string, Promise<number[]>>();

export async function embedFrontAndBack(
  frontUri: string,
  backUri: string | null | undefined
): Promise<number[]> {
  if (!backUri) return embedImage(frontUri);

  const cacheKey = `${frontUri}::${backUri}`;
  const inflight = inflightEnsembleCache.get(cacheKey);
  if (inflight) {
    console.log(
      `[visualRag] embedFrontAndBack: inflight HIT for ${frontUri.slice(-20)} + ${backUri.slice(-20)}`
    );
    return inflight;
  }

  const promise = (async () => {
    const t0 = Date.now();
    const [front, back] = await Promise.all([
      embedImage(frontUri),
      embedImage(backUri),
    ]);

    if (front.length !== back.length) {
      console.warn(
        `[visualRag] embedFrontAndBack: dim mismatch front=${front.length} back=${back.length} — falling back to front`
      );
      return front;
    }

    const combined = new Array<number>(front.length);
    for (let i = 0; i < front.length; i++) {
      combined[i] = (front[i] + back[i]) / 2;
    }
    const renormalized = normalize(combined);

    console.log(
      `[visualRag] embedFrontAndBack: avg+norm done in ${Date.now() - t0}ms (front+back ensemble)`
    );
    return renormalized;
  })();

  inflightEnsembleCache.set(cacheKey, promise);
  promise.finally(() => {
    if (inflightEnsembleCache.get(cacheKey) === promise) {
      inflightEnsembleCache.delete(cacheKey);
    }
  });
  return promise;
}

export async function embedAllPhotos(
  uris: Array<string | null | undefined>
): Promise<{ per: number[][]; combined: number[]; dim: number } | null> {
  const clean: string[] = [];
  const seen = new Set<string>();
  for (const u of uris) {
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    clean.push(u);
  }
  if (clean.length === 0) return null;

  const t0 = Date.now();
  const results = await Promise.allSettled(clean.map((u) => embedImage(u)));
  const per: number[][] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      per.push(r.value);
    }
  }
  if (per.length === 0) return null;

  const dim = per[0].length;
  const sized = per.filter((p) => p.length === dim);
  if (sized.length === 0) return null;

  const sum = new Array<number>(dim).fill(0);
  for (const p of sized) for (let i = 0; i < dim; i++) sum[i] += p[i];
  for (let i = 0; i < dim; i++) sum[i] /= sized.length;
  const combined = normalize(sum);

  console.log(
    `[visualRag] embedAllPhotos: ${sized.length}/${clean.length} photos in ${Date.now() - t0}ms`
  );
  return { per: sized, combined, dim };
}

export function clearScanCaches(): void {
  const n = embedCache.size;
  embedCache.clear();
  inflightCache.clear();
  inflightEnsembleCache.clear();
  if (n > 0) console.log(`[visualRag] cleared ${n} embed cache entries`);
}

function normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

function embeddingFingerprint(embedding: number[]): string {
  return embedding.slice(0, 8).map((v) => v.toFixed(4)).join(',');
}

type RagCacheEntry<T> = {
  promise: Promise<T>;
  expires: number;
};

const RAG_CACHE_TTL_MS = 5 * 60 * 1000;
const RAG_CACHE_MAX = 10;

const ragWatchesCache = new Map<string, RagCacheEntry<SimilarWatchesResult>>();
const ragCertCache = new Map<string, RagCacheEntry<ExpertCertMatch[]>>();

function getRagCached<T>(
  cache: Map<string, RagCacheEntry<T>>,
  key: string
): Promise<T> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.promise;
}

function setRagCached<T>(
  cache: Map<string, RagCacheEntry<T>>,
  key: string,
  promise: Promise<T>
): void {
  if (cache.size >= RAG_CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { promise, expires: Date.now() + RAG_CACHE_TTL_MS });
}

export type SimilarWatchesResult = {
  candidates: SimilarWatch[];
  globalSpread: number;
  topMargin: number;
  topSimilarity: number;
  refCount: number;
};

export async function findSimilarWatches(
  embedding: number[],
  k = 5,
  threshold = 0.0
): Promise<SimilarWatchesResult> {
  const useV2 = shouldUseProbeV2();
  const cacheKey = `${useV2 ? 'v2' : 'v1'}:${embeddingFingerprint(embedding)}:${k}:${threshold}`;
  const cached = getRagCached(ragWatchesCache, cacheKey);
  if (cached) {
    console.log(`[visualRag] match_watches_v2 cache HIT (k=${k}, thr=${threshold})`);
    return cached;
  }
  const promise = _findSimilarWatchesImpl(embedding, k, threshold, useV2);
  setRagCached(ragWatchesCache, cacheKey, promise);
  promise.catch(() => ragWatchesCache.delete(cacheKey));
  return promise;
}

async function _findSimilarWatchesImpl(
  embedding: number[],
  k = 5,
  threshold = 0.0,
  useProbeV2 = true
): Promise<SimilarWatchesResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('ยังไม่ได้ตั้งค่า Supabase');
  }

  const t0 = Date.now();
  const fetchK = Math.max(k * 4, 20);
  const maxDistance = 1 - Math.min(Math.max(threshold, -1), 1);

  let queryEmbedding = embedding;
  if (useProbeV2) {
    try {
      queryEmbedding = await applyLinearProbe(embedding);
    } catch (e: any) {
      console.warn(`[visualRag] applyLinearProbe failed, falling back to 256 slice: ${e?.message}`);
      queryEmbedding = embedding.slice(0, 256);
    }
  } else {
    // Falls back to slicing to 256 dimension if probe explicitly disabled
    queryEmbedding = embedding.slice(0, 256);
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_watches_v2`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query_embedding: queryEmbedding,
      match_count: fetchK,
      max_distance: maxDistance,
    }),
  });
  const fetchMs = Date.now() - t0;

  if (!res.ok) {
    const txt = await res.text();
    console.warn(`[visualRag] match_watches_v2 RPC ${res.status} in ${fetchMs}ms: ${txt.slice(0, 200)}`);
    return {
      candidates: [],
      globalSpread: 0,
      topMargin: 0,
      topSimilarity: 0,
      refCount: 0,
    };
  }

  const rows = (await res.json()) as Array<{
    watch_id: string;
    name: string;
    brand: string;
    reference: string;
    image_url: string;
    embedding_source: string;
    distance: number;
  }>;

  if (rows.length === 0) {
    console.log(`[visualRag] match_watches_v2 returned 0 rows in ${fetchMs}ms`);
    return {
      candidates: [],
      globalSpread: 0,
      topMargin: 0,
      topSimilarity: 0,
      refCount: 0,
    };
  }

  const scored = rows.map((r) => ({
    ...r,
    similarity: 1 - Number(r.distance ?? 1),
  }));

  const sims = scored.map((r) => r.similarity);
  const minSim = Math.min(...sims);
  const maxSim = Math.max(...sims);
  const avgSim = sims.reduce((a, b) => a + b, 0) / sims.length;

  console.log(
    `[visualRag] match_watches_v2: ${rows.length} rows in ${fetchMs}ms, ` +
      `top.id=${scored[0]?.watch_id ?? 'n/a'}, top.sim=${maxSim.toFixed(3)}, ` +
      `spread=${(maxSim - minSim).toFixed(3)}`
  );

  const top = scored
    .filter((r) => r.similarity >= threshold)
    .slice(0, k);

  const candidates = top.map((r) => ({
    id: r.watch_id,
    name: r.name,
    brand: r.brand,
    reference: r.reference,
    imageUrl: r.image_url,
    embeddingSource: r.embedding_source,
    similarity: r.similarity,
  }));

  return {
    candidates,
    globalSpread: maxSim - minSim,
    topMargin: maxSim - avgSim,
    topSimilarity: maxSim,
    refCount: rows.length,
  };
}

export type ExpertCertMatch = {
  certId: string;
  watchName: string;
  watchReference: string | null;
  brand: string | null;
  caseMaterial: string | null;
  yearMade: string | null;
  certUrl: string;
  matchedWatchId: string | null;
  imageIndex: number;
  distance: number;
  similarity: number;
};

const EXPERT_CERT_MAX_DISTANCE = 0.40;

export async function findSimilarExpertCerts(
  embedding: number[],
  k = 5
): Promise<ExpertCertMatch[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];

  const cacheKey = `${embeddingFingerprint(embedding)}:${k}`;
  const cached = getRagCached(ragCertCache, cacheKey);
  if (cached) {
    console.log(`[expertCert] cache HIT (k=${k})`);
    return cached;
  }
  const promise = _findSimilarExpertCertsImpl(embedding, k);
  setRagCached(ragCertCache, cacheKey, promise);
  promise.catch(() => ragCertCache.delete(cacheKey));
  return promise;
}

async function _findSimilarExpertCertsImpl(
  embedding: number[],
  k = 5
): Promise<ExpertCertMatch[]> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_expert_cert`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_count: k,
        max_distance: EXPERT_CERT_MAX_DISTANCE,
      }),
    });
    if (!res.ok) {
      console.warn(
        `[expertCert] match RPC ${res.status}: ${(await res.text()).slice(0, 200)}`
      );
      return [];
    }
    const rows = (await res.json()) as any[];
    const matches = rows.map((r) => ({
      certId: r.cert_id,
      watchName: r.watch_name,
      watchReference: r.watch_reference ?? null,
      brand: r.brand ?? null,
      caseMaterial: r.case_material ?? null,
      yearMade: r.year_made ?? null,
      certUrl: r.cert_url,
      matchedWatchId: r.matched_watch_id ?? null,
      imageIndex: Number(r.image_index ?? 0),
      distance: Number(r.distance ?? 1),
      similarity: 1 - Number(r.distance ?? 1),
    }));
    console.log(
      `[expertCert] ${matches.length} matches in ${Date.now() - t0}ms` +
        (matches[0]
          ? ` — top=${matches[0].certId} dist=${matches[0].distance.toFixed(3)}`
          : '')
    );
    return matches;
  } catch (e: any) {
    console.warn(`[expertCert] match failed: ${e?.message}`);
    return [];
  }
}

export type CrossValidationVerdict = 'high' | 'medium' | 'low' | 'not-watch';

export type CrossValidationResult = {
  watches: { id: string; name: string; brand: string; reference: string; distance: number } | null;
  watchesCandidates: Array<{
    id: string;
    name: string;
    brand: string;
    reference: string;
    similarity: number;
    imageUrl: string;
  }>;
  cert: { certId: string; watchName: string; watchReference: string | null; brand: string | null; certUrl: string; distance: number } | null;
  verdict: CrossValidationVerdict;
  agreementScore: number;
  sourcesCount: 0 | 1 | 2;
  reasons: string[];
  unifiedBrand: string | null;
  unifiedReference: string | null;

  authClassifier: {
    pReal: number;
    perPhoto: number[];
    bucket: 'real_strong' | 'real_weak' | 'fake_weak' | 'fake_strong';
    n: number;
  } | null;

  fakeMatch: {
    id: string;
    watchId: string | null;
    similarity: number;
    sourceUrl: string | null;
    fakeSignalNotes: string | null;
  } | null;

  fakeVsRealSignal: 'closer_to_real' | 'closer_to_fake' | 'unclear' | null;
  totalMs: number;
};

function extractIdentifyingTokens(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  const stripped = s
    .replace(/นาฬิกา|เรือน|สาย|ขอบ|รุ่น/g, ' ')
    .replace(/หลวงพ่อ|หลวงปู่/g, ' ') // Defensive strip
    .replace(/\s+/g, ' ')
    .trim();
  return new Set(
    stripped
      .split(/[\s-]+/)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 2)
  );
}

function setsIntersection(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const t of a) if (b.has(t)) out.push(t);
  return out;
}

export function buildNotWatchCrossValidation(): CrossValidationResult {
  return {
    watches: null,
    watchesCandidates: [],
    cert: null,
    verdict: 'not-watch',
    agreementScore: 0,
    sourcesCount: 0,
    reasons: ['ภาพนี้ไม่ใช่นาฬิกาข้อมือ — ลองถ่ายภาพหน้าปัดให้ชัดเจนและเต็มกรอบ'],
    unifiedBrand: null,
    unifiedReference: null,
    authClassifier: null,
    fakeMatch: null,
    fakeVsRealSignal: null,
    totalMs: 0,
  };
}

export async function crossValidateScan(
  frontUri: string,
  backUri: string | null | undefined,
  aiName?: string,
  extraUris?: Array<string | null | undefined>
): Promise<CrossValidationResult> {
  const t0 = Date.now();
  const empty: CrossValidationResult = {
    watches: null,
    watchesCandidates: [],
    cert: null,
    verdict: 'low',
    agreementScore: 0,
    sourcesCount: 0,
    reasons: ['ยังไม่ได้ตั้งค่า Visual RAG'],
    unifiedBrand: null,
    unifiedReference: null,
    authClassifier: null,
    fakeMatch: null,
    fakeVsRealSignal: null,
    totalMs: 0,
  };
  if (!isVisualRagConfigured()) return empty;

  const CROSSVAL_EMBED_TIMEOUT_MS = 18000;
  const allUris: Array<string | null | undefined> = [frontUri, backUri];
  if (Array.isArray(extraUris)) allUris.push(...extraUris);

  const photoResult = await Promise.race([
    embedAllPhotos(allUris),
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), CROSSVAL_EMBED_TIMEOUT_MS)
    ),
  ]);
  if (!photoResult) {
    return {
      ...empty,
      reasons: ['Replicate cold-start timeout — cross-validation unavailable'],
      totalMs: Date.now() - t0,
    };
  }
  const embedding = photoResult.combined;
  const perPhotoEmb = photoResult.per;

  // Lazy-load classifier + fakeMatch helpers
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { predictAuthenticityMulti, bucketAuthVerdict } = require('./authenticityClassifier');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { findSimilarFakes } = require('./fakeMatch');

  const [watchesResult, certResult, fakeResult] = await Promise.all([
    findSimilarWatches(embedding, 5, 0.0).catch(() => ({ candidates: [] }) as any),
    findSimilarExpertCerts(embedding, 5).catch(() => [] as ExpertCertMatch[]),
    findSimilarFakes(embedding, 3).catch(() => [] as any[]),
  ]);

  const topWatch = watchesResult?.candidates?.[0] ?? null;
  const topCert = certResult?.[0] ?? null;

  const watches = topWatch
    ? {
        id: topWatch.id,
        name: topWatch.name,
        brand: topWatch.brand,
        reference: topWatch.reference,
        distance: 1 - (topWatch.similarity ?? 0),
      }
    : null;
  const cert = topCert
    ? {
        certId: topCert.certId,
        watchName: topCert.watchName,
        watchReference: topCert.watchReference,
        brand: topCert.brand,
        certUrl: topCert.certUrl,
        distance: topCert.distance,
      }
    : null;

  const wTokens = extractIdentifyingTokens(watches?.name);
  const cTokens = extractIdentifyingTokens(cert?.watchName);
  const aiTokens = aiName ? extractIdentifyingTokens(aiName) : null;

  type Pair = { a: string; b: string; agree: boolean; tokens: string[] };
  const pairs: Pair[] = [];

  if (aiTokens && aiTokens.size > 0) {
    if (watches) {
      const overlap = setsIntersection(aiTokens, wTokens);
      pairs.push({ a: 'AI', b: 'watches', agree: overlap.length > 0, tokens: overlap });
    }
    if (cert) {
      const overlap = setsIntersection(aiTokens, cTokens);
      pairs.push({ a: 'AI', b: 'cert', agree: overlap.length > 0, tokens: overlap });
    }
  } else {
    if (watches && cert) {
      const overlap = setsIntersection(wTokens, cTokens);
      pairs.push({ a: 'watches', b: 'cert', agree: overlap.length > 0, tokens: overlap });
    }
  }

  const agreementScore = pairs.length === 0 ? 0 : pairs.filter((p) => p.agree).length / pairs.length;
  const sourcesAvailable = [watches, cert].filter(Boolean).length;

  let verdict: CrossValidationVerdict;
  if (sourcesAvailable === 0) {
    verdict = 'low';
  } else if (sourcesAvailable === 1) {
    verdict = 'medium';
  } else if (agreementScore >= 0.99) {
    verdict = 'high';
  } else if (agreementScore >= 0.5) {
    verdict = 'medium';
  } else {
    verdict = 'low';
  }

  const reasons: string[] = [];
  const sourceLabels: Record<string, string> = {
    AI: 'AI',
    watches: 'ฐานข้อมูลนาฬิกา',
    cert: 'ใบรับรองสมาคม',
  };

  for (const p of pairs) {
    if (p.agree) {
      reasons.push(
        `${sourceLabels[p.b]} ยืนยันชื่อจาก ${sourceLabels[p.a]} (คีย์เวิร์ด: ${p.tokens.slice(0, 2).join(', ')})`
      );
    }
  }

  if (sourcesAvailable === 0) {
    reasons.push('ไม่พบนาฬิกาที่สอดคล้องในฐานข้อมูลระบบ');
  } else if (sourcesAvailable === 1) {
    const which = watches ? 'ฐานข้อมูลนาฬิกา' : 'ใบรับรองสมาคม';
    reasons.push(`พบข้อมูลเฉพาะใน ${which} — ยังไม่สามารถยืนยันแบบกลุ่ม`);
  } else if (verdict === 'low') {
    reasons.push('ข้อมูลจากตู้ตรวจขัดแย้งกัน — ระบบ AI อาจคาดเคลื่อน');
  }

  const STRICT_CERT_DISTANCE = 0.30;
  const certIsStrong = !!cert && cert.distance < STRICT_CERT_DISTANCE;

  let unifiedBrand: string | null = null;
  let unifiedReference: string | null = null;

  if (certIsStrong && cert && cert.brand) {
    unifiedBrand = cert.brand;
  } else if (watches?.brand) {
    unifiedBrand = watches.brand;
  }

  if (certIsStrong && cert && cert.watchReference) {
    unifiedReference = cert.watchReference;
  } else if (watches?.reference) {
    unifiedReference = watches.reference;
  }

  const totalMs = Date.now() - t0;
  console.log(
    `[crossVal] verdict=${verdict} score=${agreementScore.toFixed(2)} ` +
      `(watches=${watches ? '✓' : '✗'} cert=${cert ? '✓' : '✗'}) ${totalMs}ms`
  );

  const watchesCandidates =
    watchesResult?.candidates
      ?.slice(1, 4)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        brand: c.brand,
        reference: c.reference,
        similarity: c.similarity ?? 0,
        imageUrl: c.imageUrl ?? '',
      })) ?? [];

  let authClassifier: CrossValidationResult['authClassifier'] = null;
  try {
    const clf = await predictAuthenticityMulti(perPhotoEmb);
    if (clf?.pReal !== null && typeof clf.pReal === 'number') {
      authClassifier = {
        pReal: +clf.pReal.toFixed(4),
        perPhoto: clf.perPhoto.map((p: number) => +p.toFixed(4)),
        bucket: bucketAuthVerdict(clf.pReal),
        n: clf.n,
      };
    }
  } catch (e: any) {
    console.warn(`[crossVal] classifier failed: ${e?.message}`);
  }

  let fakeMatch: CrossValidationResult['fakeMatch'] = null;
  let fakeVsRealSignal: CrossValidationResult['fakeVsRealSignal'] = null;
  const topFake = (fakeResult as any[])?.[0] ?? null;
  if (topFake) {
    fakeMatch = {
      id: topFake.id,
      watchId: topFake.watchId ?? null,
      similarity: +Number(topFake.similarity ?? 0).toFixed(4),
      sourceUrl: topFake.sourceUrl ?? null,
      fakeSignalNotes: topFake.fakeSignalNotes ?? null,
    };
    const simReal = topWatch ? (topWatch.similarity ?? 0) : 0;
    const simFake = topFake.similarity ?? 0;
    const diff = simReal - simFake;
    if (diff >= 0.05) fakeVsRealSignal = 'closer_to_real';
    else if (diff <= -0.05) fakeVsRealSignal = 'closer_to_fake';
    else fakeVsRealSignal = 'unclear';
  }

  if (authClassifier) {
    const pct = Math.round(authClassifier.pReal * 100);
    if (authClassifier.bucket === 'fake_strong') {
      reasons.push(`AI ตรวจสอบความแท้: ${pct}% — มีคุณลักษณะใกล้เคียงของเลียนแบบ`);
    } else if (authClassifier.bucket === 'real_strong') {
      reasons.push(`AI ตรวจสอบความแท้: ${pct}% — คุณลักษณะใกล้เคียงนาฬิกาแท้`);
    }
  }
  if (fakeVsRealSignal === 'closer_to_fake' && fakeMatch) {
    reasons.push('⚠️ มีความใกล้เคียงลักษณะของเลียนแบบมากกว่าของแท้ — โปรดตรวจสอบอย่างละเอียด');
  }

  return {
    watches,
    watchesCandidates,
    cert,
    verdict,
    agreementScore,
    sourcesCount: sourcesAvailable as 0 | 1 | 2,
    reasons,
    unifiedBrand,
    unifiedReference,
    authClassifier,
    fakeMatch,
    fakeVsRealSignal,
    totalMs,
  };
}
