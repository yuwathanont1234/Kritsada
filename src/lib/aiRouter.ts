import { MembershipTier } from './auth';
import { effectiveCaps } from './tier';
import { AuthPayload, PricePayload } from './ai';
import {
  isGeminiConfigured,
  imageWidthForTier,
  outputTokensForTier,
  identifyWatchGemini,
  assessAuthenticityGemini,
  fetchWatchPricesGemini,
} from './geminiAi';
import { ScanResult } from './types';
import {
  awaitPrewarm,
  embedFrontAndBack,
  findSimilarWatches,
  scoreConformity,
} from './visualRag';
import { predictAuthenticity, bucketAuthVerdict } from './authenticityClassifier';
import {
  findSimilarExpertCerts,
  isVisualRagConfigured,
  SimilarWatch,
  isEmbeddingCached,
} from './visualRag';
import { logCostEvent, COST_PER_CALL } from './costBreaker';
import { getBrandFallbackPrice } from './data/brandFallbackPrices';
import { validateSerial } from './data/serialValidation';
import { getDataConsent } from './dataConsent';
import { scanBreadcrumb } from './sentry';

/**
 * Tier-based AI routing for Luxury Watch Authenticator.
 *
 * Strategy:
 *   - All tiers use Gemini models.
 *   - Cascade:
 *       1. Visual RAG (Standard+): DINOv3 + pgvector similarity matching against 5,005 watch references.
 *       2. Quick Identify: identifyWatchGemini without grounded search (~3-6s).
 *       3. pgvector Visual Match Validation: If visual matches or expert certs agree strongly, skip Phase 1C retry.
 *       4. Grounded Search Fallback (Standard+): If initial confidence falls below threshold (75% for Standard/Pro, 85% for Premium) and has no DB agreement, rerun Gemini with Google Search enabled.
 */

// ── Visual-RAG quality gates — recalibrated for the RAW 1024-d DINOv3 space
// (migration 0015 switched matching off the 256-d probe). 1024-d cosines are
// numerically SMALL (correct catalog matches land ~0.16-0.23, cross-brand
// <0.13) but the RANKING is reliable — same-brand fills the top dozens of
// neighbours before any cross-brand appears (first cross-brand at rank 49-366
// in measurements). So these absolute floors are deliberately loose; the real
// guard against a wrong-brand hit is the downstream brand/model AGREEMENT check
// (Phase 1B). NOTE: floors are catalog↔catalog-calibrated — phone↔catalog may
// sit lower, so watch the `[visualRag] top.sim=` logs on live scans and loosen
// these if genuine matches get cut.
const RAG_MIN_SIMILARITY = 0.08;
// globalSpread = (max − min similarity) across the top-K. A clean same-brand
// top-K in 1024-d spreads only ~0.05-0.07, so this is just a floor against a
// degenerate near-uniform result (a broken/zero embedding). 0.08 → 0.012.
const RAG_MIN_GLOBAL_SPREAD = 0.012;
const RAG_MIN_TOP_MARGIN = 0.006;
// Hard cap on the Phase-1C Google-grounded identify retry. Normal grounded
// calls land in 5-15s; a 53s tail has been observed returning unchanged
// confidence (then discarded). The grounded result is only used when it
// strictly beats Flash, so aborting a slow call and accepting Flash is nearly
// free. See retryIdentifyWithGoogle.
const GROUNDED_RETRY_TIMEOUT_MS = 25000;
// Visual RAG is treated as a "best-effort hint" for Phase 1A identify.
// History: timeouts were raised 8s → 25s → 35s to wait for Replicate
// cold starts (30-60s) so the embedding could feed candidates into
// identify and prevent Pro-grounded retries. Reality: when Replicate
// is cold, the 35s wait + 60s cold-start + identify = 160s+ scans
// (live log: 166537ms for a Rolex OP scan).
//
// Reverted to a tight 10s budget: when Replicate is warm (keep-warm
// cron working), embed lands in 2-5s and the hint is preserved. When
// Replicate is cold, we cut our losses at 10s, run identify WITHOUT
// the RAG hint, and rely on the post-identify embed (Phase 1B, 12s
// race) to still produce DB validation. Total scan budget drops
// 166s → ~50-60s on cold paths.
const RAG_TIMEOUT_MS = 10000;
// Prewarm wait similarly trimmed. The pg_cron `replicate-keepwarm` (*/5,
// warmOnly) should keep Replicate hot; if it's cold despite that, the prewarm
// endpoint is broken upstream and we shouldn't extend the user's scan to
// compensate for an infrastructure issue. (Keep-warm history: GitHub Actions
// and a cron-job.org job were both retired 2026-05-30 — GH was throttled and
// cron-job.org did wasteful non-warmOnly full embeds; pg_cron is the sole,
// reliable channel now.)
const PREWARM_WAIT_MS = 8000;

/**
 * Visual RAG outcome — distinguishes "no candidates because it didn't
 * run / ran out of time" from "ran fine but rejected on similarity
 * thresholds". The downstream Pro-retry gate uses this distinction:
 * if the visual signal genuinely failed to corroborate (rejected), we
 * should retry; if it never ran (skipped), retry can't help and just
 * burns ฿2 + 30s.
 */
type RagOutcome = {
  candidates: SimilarWatch[];
  /** True when embed timed out or errored — no visual signal available. */
  skipped: boolean;
  /** True when embed succeeded but candidates failed quality gates. */
  rejected: boolean;
  /** Raw DINOv3 embedding (when embed succeeded) — for the A2 conformity shadow. */
  embedding?: number[];
};

async function getVisualCandidates(
  frontUri: string,
  backUri?: string | null
): Promise<RagOutcome> {
  if (!isVisualRagConfigured()) return { candidates: [], skipped: true, rejected: false };
  const ragT0 = Date.now();
  try {
    const prewarmT0 = Date.now();
    await awaitPrewarm(PREWARM_WAIT_MS);
    const prewarmWaited = Date.now() - prewarmT0;
    if (prewarmWaited > 200) {
      console.log(`[aiRouter] waited ${prewarmWaited}ms for prewarm`);
    }

    const embedding = await Promise.race([
      embedFrontAndBack(frontUri, backUri ?? undefined),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`RAG timeout after ${RAG_TIMEOUT_MS}ms`)),
          RAG_TIMEOUT_MS
        )
      ),
    ]);
    console.log(`[aiRouter] Visual RAG embed done in ${Date.now() - ragT0}ms`);
    const { candidates, globalSpread, topMargin, topSimilarity } =
      await findSimilarWatches(embedding, 5, 0.0);

    if (globalSpread < RAG_MIN_GLOBAL_SPREAD) {
      console.log(
        `[aiRouter] Visual RAG: REJECTED — global spread ${globalSpread.toFixed(3)} < ${RAG_MIN_GLOBAL_SPREAD}. Falling back to image-only.`
      );
      return { candidates: [], skipped: false, rejected: true, embedding };
    }
    if (topMargin < RAG_MIN_TOP_MARGIN) {
      console.log(
        `[aiRouter] Visual RAG: REJECTED — top margin ${topMargin.toFixed(3)} < ${RAG_MIN_TOP_MARGIN}. Falling back to image-only.`
      );
      return { candidates: [], skipped: false, rejected: true, embedding };
    }
    if (topSimilarity < RAG_MIN_SIMILARITY) {
      console.log(
        `[aiRouter] Visual RAG: REJECTED — top sim ${topSimilarity.toFixed(3)} < ${RAG_MIN_SIMILARITY}`
      );
      return { candidates: [], skipped: false, rejected: true, embedding };
    }

    const filtered = candidates.filter((c) => c.similarity >= RAG_MIN_SIMILARITY);
    console.log(
      `[aiRouter] Visual RAG: ${filtered.length}/${candidates.length} above ${RAG_MIN_SIMILARITY}, top=${filtered[0]?.id} (sim=${topSimilarity.toFixed(3)})`
    );
    return { candidates: filtered, skipped: false, rejected: false, embedding };
  } catch (e: any) {
    console.warn(
      `[aiRouter] Visual RAG SKIPPED (${Date.now() - ragT0}ms):`,
      e?.message
    );
    return { candidates: [], skipped: true, rejected: false };
  }
}

async function retryIdentifyWithGoogle(
  frontUri: string,
  backUri: string | undefined,
  ragArg: SimilarWatch[] | undefined,
  prevAttempt: ScanResult,
  imageMaxWidth: number,
  tier: MembershipTier,
  cohortHash: string | null,
  signal?: AbortSignal
): Promise<ScanResult | null> {
  // Hard cap on the grounded retry. A pathological grounded call has been
  // observed taking 53s and returning the SAME confidence (65 → 65), which is
  // then discarded by the `confidence > previous` gate — i.e. ~50s + ~฿2 of
  // pure waste. Since the grounded result is only kept when it strictly
  // improves on Flash (rare), aborting a slow call and accepting Flash costs
  // us almost nothing. Combine the timeout with the upstream scan signal so a
  // user backgrounding the scan still cancels promptly.
  const ctrl = new AbortController();
  const timedOut = { value: false };
  const timer = setTimeout(() => {
    timedOut.value = true;
    ctrl.abort();
  }, GROUNDED_RETRY_TIMEOUT_MS);
  const forwardAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', forwardAbort);
  }
  try {
    const retryT0 = Date.now();
    const retried = await identifyWatchGemini(
      frontUri,
      backUri,
      ragArg,
      undefined,
      undefined,
      { enableGroundedSearch: true, imageMaxWidth, disableThinking: true, signal: ctrl.signal }
    );
    console.log(
      `[aiRouter] Gemini-grounded retry done in ${Date.now() - retryT0}ms, confidence ${prevAttempt.confidence ?? 0} → ${retried.confidence ?? 0}`
    );

    // Cost logging for grounded identify scan retry. Grounded calls cost ~10×
    // a plain Flash scan (Google Search grounding is billed on top of tokens),
    // so log the real `scan_grounded` cost — not COST_PER_CALL.scan — otherwise
    // the daily cost breaker materially under-counts spend.
    logCostEvent({
      type: 'scan_grounded',
      costUsd: COST_PER_CALL.scan_grounded,
      tier,
      cohortHash,
      cacheHit: false,
    }).catch(() => {});

    return {
      ...retried,
      // @ts-expect-error — tag for trace validation
      _identifiedVia: 'gemini-grounded',
    };
  } catch (e: any) {
    if (timedOut.value) {
      console.warn(
        `[aiRouter] grounded retry aborted after ${GROUNDED_RETRY_TIMEOUT_MS}ms cap — accepting Flash result`
      );
    } else {
      console.warn('[aiRouter] retryIdentifyWithGoogle failed:', e?.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', forwardAbort);
  }
}

/**
 * On-demand authenticity assessment. Sends image(s) + identified watch
 * metadata to Gemini and returns auth/checklist/repro fields.
 */
export async function assessAuthenticityByTier(
  tier: MembershipTier,
  frontUri: string,
  backUri: string | undefined,
  identified: { name: string; brand: string; reference: string },
  signals?: import('./prompts').AuthSignals,
  certExemplarUrls?: string[],
  extraAngleUris?: string[],
  signal?: AbortSignal,
  language: 'th' | 'en' = 'en',
  extraAngleRoles?: string[]
): Promise<AuthPayload> {
  const imageMaxWidth = imageWidthForTier(tier);
  const t0 = Date.now();
  const result = await assessAuthenticityGemini(frontUri, backUri, identified, {
    imageMaxWidth,
    signals,
    certExemplarUrls,
    extraAngleUris,
    extraAngleRoles,
    disableThinking: true,
    signal,
    language,
  });
  console.log(`[aiRouter] auth-on-demand done in ${Date.now() - t0}ms`);

  // Cost logging for authenticity assessment
  const consent = await getDataConsent().catch(() => ({ granted: false, cohortHash: null }));
  logCostEvent({
    type: 'authenticity',
    costUsd: COST_PER_CALL.authenticity,
    tier,
    cohortHash: consent.granted ? consent.cohortHash : null,
    cacheHit: false,
  }).catch(() => {});

  return result;
}

/**
 * On-demand market price lookups utilizing Google Search grounding.
 */
export async function fetchPricesByTier(
  tier: MembershipTier,
  identified: { name: string; brand: string; reference: string; confidence?: number },
  signal?: AbortSignal
): Promise<{
  prices: PricePayload;
  fromCache: boolean;
  fetchedAt: string;
}> {
  const priceT0 = Date.now();
  const prices = await fetchWatchPricesGemini(
    identified.name,
    identified.brand,
    identified.reference,
    { disableThinking: true, idConfidence: identified.confidence, signal }
  );
  console.log(`[aiRouter] price-on-demand fetched in ${Date.now() - priceT0}ms`);

  // Cost logging for deep price search
  const consent = await getDataConsent().catch(() => ({ granted: false, cohortHash: null }));
  logCostEvent({
    type: 'deep_search',
    costUsd: COST_PER_CALL.deep_search,
    tier,
    cohortHash: consent.granted ? consent.cohortHash : null,
    cacheHit: false,
  }).catch(() => {});

  const now = new Date().toISOString();
  return { prices, fromCache: false, fetchedAt: now };
}

export async function logFullyCachedScan(
  tier: MembershipTier,
  cohortHash: string | null
): Promise<void> {
  const enableVisualRag = !(tier === 'free') && isVisualRagConfigured();
  const promises: Promise<void>[] = [];

  if (enableVisualRag) {
    promises.push(
      logCostEvent({
        type: 'embedding',
        costUsd: 0,
        cacheHit: true,
        tier,
        cohortHash,
      })
    );
  }

  promises.push(
    logCostEvent({
      type: 'scan',
      costUsd: 0,
      cacheHit: true,
      tier,
      cohortHash,
    })
  );

  promises.push(
    logCostEvent({
      type: 'authenticity',
      costUsd: 0,
      cacheHit: true,
      tier,
      cohortHash,
    })
  );

  promises.push(
    logCostEvent({
      type: 'deep_search',
      costUsd: 0,
      cacheHit: true,
      tier,
      cohortHash,
    })
  );

  await Promise.all(promises).catch((err) => {
    console.warn('[aiRouter] logFullyCachedScan failed:', err);
  });
}

/**
 * Main cached/cascade identification scan pipeline by membership tier.
 */
export async function analyzeWatchByTier(
  tier: MembershipTier,
  frontUri: string,
  backUri?: string,
  isTrialing = false,
  extraImages?: string[],
  userWeightG?: number,
  signal?: AbortSignal,
  language: 'th' | 'en' = 'en',
  // Roles for each entry of extraImages ('crown' | 'clasp' | ...) so the auth
  // prompt can label macro shots per image. Parallel array; optional.
  extraImageRoles?: string[]
): Promise<{
  result: ScanResult;
  provider: 'gemini';
  ragCandidates?: SimilarWatch[];
}> {
  const totalT0 = Date.now();
  scanBreadcrumb('analyzeWatchByTier:start', {
    tier,
    isTrialing,
    hasBack: !!backUri,
    extraImageCount: extraImages?.length ?? 0,
    hasUserWeight: typeof userWeightG === 'number',
  });

  if (!isGeminiConfigured()) {
    throw new Error(
      'AI System is not ready. Please contact administrator (Gemini key not configured)'
    );
  }

  // Visual RAG candidates (Standard+)
  let candidates: SimilarWatch[] = [];
  const enableVisualRag = !(tier === 'free' && !isTrialing) && isVisualRagConfigured();
  const embedCached = enableVisualRag ? isEmbeddingCached(frontUri, backUri) : false;
  
  const embedPromise = enableVisualRag
    ? embedFrontAndBack(frontUri, backUri).catch((e) => {
        console.warn('[aiRouter] RAG embed failed (non-fatal):', e?.message);
        return null;
      })
    : Promise.resolve(null);

  if (enableVisualRag) {
    embedPromise.then(async (resolvedEmbed) => {
      if (resolvedEmbed) {
        const consent = await getDataConsent().catch(() => ({ granted: false, cohortHash: null }));
        logCostEvent({
          type: 'embedding',
          costUsd: embedCached ? 0 : COST_PER_CALL.embedding,
          tier,
          cohortHash: consent.granted ? consent.cohortHash : null,
          cacheHit: embedCached,
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  // Always disable thinking for identify — it's a fast visual classification,
  // not a deep reasoning task. With thinking enabled the call takes 30-40s
  // instead of 8-12s, for no measurable accuracy gain on watch identification.
  // (The reasoning happens in the AUTH step downstream, where Pro-tier model
  // and thinking budget actually matter.)
  const disableThinking = true;
  const imageMaxWidth = imageWidthForTier(tier);
  const maxOutputTokens = outputTokensForTier(tier);

  // ── Phase 1A + Visual RAG in PARALLEL ────────────────────────
  // Previously: getVisualCandidates was awaited BEFORE identify.
  // That added prewarm-wait (8s) + embed-timeout (10s) to every
  // cold-path scan, even though identify doesn't strictly need
  // RAG hints (Gemini Flash identifies most watches correctly
  // from images alone). Pulling identify out of that chain saves
  // 5-18s/scan on the cold path with no expected accuracy loss
  // — the RAG candidates are still used afterwards for Phase 1B
  // DB validation and the Pro-retry gate.
  //
  // Trade-off: identify no longer receives RAG candidates as a
  // prompt hint. For obscure references this MIGHT shift identify
  // from "Black Bay Chrono (ref 79360)" to "Black Bay Chrono".
  // The post-identify flow corrects this via dbValidated /
  // visualBrandCorroborated when candidates land.
  const identifyPromise = identifyWatchGemini(
    frontUri,
    backUri,
    undefined,                             // no RAG hint upfront
    undefined,
    undefined,
    { disableThinking, imageMaxWidth, maxOutputTokens, signal }
  );
  const ragPromise: Promise<RagOutcome> =
    enableVisualRag
      ? getVisualCandidates(frontUri, backUri)
      : Promise.resolve({ candidates: [], skipped: true, rejected: false });

  const [identifyResult, ragOutcome] = await Promise.all([identifyPromise, ragPromise]);

  let identified = identifyResult;
  candidates = ragOutcome.candidates;
  let ragSkipped = ragOutcome.skipped;
  let ragRejected = ragOutcome.rejected;

  // A2 conformity (SHADOW, 2026-05-30) — log how close the scan sits to
  // AUTHENTIC catalog examples of the identified ref. Non-blocking; does NOT
  // touch the verdict yet (256-d probe space is identification-tuned — we're
  // collecting real numbers to decide if a 1024-d / real+fake upgrade is worth
  // it). See migration 0009_conformity_to_reference.sql.
  if (ragOutcome.embedding && identified?.brand) {
    scoreConformity(ragOutcome.embedding, identified.brand, identified.reference || '')
      .then((c) => {
        if (c) {
          console.log(
            `[conformity:shadow] ${identified.brand} ${identified.reference || ''} → ` +
              `maxSim=${c.maxSim.toFixed(3)} meanTop8=${c.meanTopk.toFixed(3)} (scope=${c.scope}, n=${c.n})`
          );
        }
      })
      .catch(() => {});
  }

  // A1 real-vs-fake classifier (SHADOW, 2026-05-30; v2 resilient embed) —
  // independent P(real) from the scale-up model (DINOv3 1024-d → 1024→128→1).
  // v2: no longer coupled to the RAG embed. If the RAG path's embed timed out
  // (cold-start), reuse the independent front+back embed already in flight
  // (embedPromise) and, failing that, do ONE retry after a short pause — so the
  // shadow survives a cold Replicate instead of silently SKIPPING. Non-blocking;
  // does NOT touch the verdict (still validating phone-photo generalization +
  // fake scans). embedFrontAndBack returns an L2-normalized 1024-d (matches the
  // training-time normalization), so it's fed straight in.
  // Capture the resilient embedding so a COLD scan (where Phase 1B's 12s embed
  // wait already timed out) can still SALVAGE the Reference DB match below — the
  // scan already awaits this classifier, so the late embed is free to reuse.
  let classifierEmbedding: number[] | null = null;
  const authClassifierPromise: Promise<number | null> = (async () => {
    let emb: number[] | null = ragOutcome.embedding ?? null;
    let src = 'rag';
    if (!emb && enableVisualRag) {
      emb = await embedPromise.catch(() => null); // independent embed already running
      if (emb) src = 'fallback';
    }
    if (!emb && enableVisualRag) {
      await new Promise((r) => setTimeout(r, 1500)); // let a cold Replicate finish booting
      emb = await embedFrontAndBack(frontUri, backUri).catch(() => null);
      if (emb) {
        src = 'retry';
        // Account for this FRESH embed in the cost breaker. The RAG
        // embedPromise cost-log above only fires when the RAG embed
        // itself RESOLVED — here it had failed (emb was still null), so
        // we fell through to this independent retry, whose spend was
        // otherwise invisible to the breaker. Only reachable on
        // Standard+/trial: the whole block is gated by enableVisualRag,
        // so Free never embeds here (classifier logs SKIPPED instead).
        logCostEvent({ type: 'embedding', costUsd: COST_PER_CALL.embedding, tier }).catch(() => {});
      }
    }
    if (!emb) {
      console.log(
        `[authClassifier:shadow] SKIPPED — no embedding after fallback+retry ` +
          `(visualRag=${enableVisualRag}, ragSkipped=${ragOutcome.skipped}). Replicate likely still cold.`
      );
      return null;
    }
    classifierEmbedding = emb; // expose for the cold-scan DB-match salvage below
    console.log(
      `[authClassifier:shadow] running (resilient) — embedding len=${emb.length} src=${src}`
    );
    try {
      const p = await predictAuthenticity(emb);
      console.log(
        p === null
          ? `[authClassifier:shadow] P(real)=null (dim mismatch — got ${emb.length}, model wants 1024)`
          : `[authClassifier:shadow] P(real)=${p.toFixed(3)} bucket=${bucketAuthVerdict(p)} ` +
              `(${identified?.brand ?? '?'} ${identified?.name ?? '?'})`
      );
      return p;
    } catch (e: any) {
      console.warn('[authClassifier:shadow] ERROR:', e?.message);
      return null;
    }
  })();
  // Inferred ragArg for any downstream consumer that wants candidates
  // (e.g. Pro retry below). Empty array → undefined keeps existing
  // call sites that null-check on truthiness happy.
  const ragArg = candidates.length > 0 ? candidates : undefined;

  console.log(`[aiRouter] identify+RAG parallel done in ${Date.now() - totalT0}ms (rag ${ragSkipped ? 'SKIPPED' : ragRejected ? 'REJECTED' : `${candidates.length} cand`})`);
  scanBreadcrumb('identify+rag:done', {
    ms: Date.now() - totalT0,
    confidence: identified.confidence,
    ragState: ragSkipped ? 'skipped' : ragRejected ? 'rejected' : 'matched',
    candidates: candidates.length,
    brand: identified.brand?.slice(0, 30),
  });

  // Cost logging for initial fast identify
  const consent = await getDataConsent().catch(() => ({ granted: false, cohortHash: null }));
  logCostEvent({
    type: 'scan',
    costUsd: COST_PER_CALL.scan,
    tier,
    cohortHash: consent.granted ? consent.cohortHash : null,
    cacheHit: false,
  }).catch(() => {});

  // Phase 1B: pgvector Database / Expert Certificate visual cross-validation
  let dbValidated = false;
  let certValidated = false;
  // Light-touch corroboration — visual top hit agrees with Gemini on
  // brand AND model substring but at moderate similarity (0.65-0.95).
  // Skips the expensive grounded retry without claiming strong DB
  // validation. Catches the common "Gemini says 'Tudor Black Bay'
  // without ref, visual hits a Tudor Black Bay with sim=0.85" case
  // that previously triggered a ฿2.20 Pro grounded call for no
  // accuracy gain.
  let visualBrandCorroborated = false;
  let certMatchHit: any = null;
  // The corroborating candidate from the MAIN watch DB (image_embeddings, 30k
  // rows) — surfaced to the result UI's "Reference DB Match" field, which
  // previously only reflected the tiny 100-row expert-cert store.
  let visualDbMatchHit: SimilarWatch | null = null;

  if (enableVisualRag && identified.identified) {
    const DB_EMBED_TIMEOUT_MS = 12000;
    const dbEmbedding = await Promise.race([
      embedPromise,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), DB_EMBED_TIMEOUT_MS)
      ),
    ]);

    if (dbEmbedding) {
      try {
        const [similar, certMatches] = await Promise.all([
          findSimilarWatches(dbEmbedding, 3, 0.0),
          findSimilarExpertCerts(dbEmbedding, 5).catch(() => []),
        ]);

        const top = similar.candidates[0];
        if (top) {
          const matchedName = identified.name.toLowerCase().trim();
          const topName = (top.name || '').toLowerCase().trim();
          const matchesModel =
            !!matchedName && !!topName &&
            (topName.includes(matchedName) || matchedName.includes(topName));

          // Brand-substring match (handles "Officine Panerai" ↔ "Panerai",
          // "Audemars Piguet" ↔ "AP" alias variants in the DB metadata).
          const identBrand = (identified.brand || '').toLowerCase().trim();
          const topBrand = (top.brand || '').toLowerCase().trim();
          const matchesBrand =
            !!identBrand && !!topBrand &&
            (topBrand.includes(identBrand) || identBrand.includes(topBrand));

          // ── 1024-d corroboration tiers (migration 0015). Raw-DINOv3 cosines
          // are numerically small (correct catalog matches ~0.16-0.23,
          // cross-brand <0.13), so these floors are NOT the old 256-d-probe
          // thresholds (0.95/0.85/0.65). The real signal is brand/model
          // AGREEMENT between two INDEPENDENT methods (Gemini vision + DINOv3
          // retrieval): the 1024-d top hit is a rank-reliable same-brand match,
          // so brand agreement carries the corroboration and sim is just a
          // loose floor. A false hit would need a coincidental shared brand
          // with Gemini's guess. (Catalog-calibrated — if live phone scans
          // corroborate lower, widen via the `[visualRag] top.sim` logs.)
          if (top.similarity >= 0.15 && matchesBrand && matchesModel) {
            // Strong: brand AND model agree at a confident 1024-d sim.
            dbValidated = true;
            console.log(
              `[aiRouter] DB-validated ✓ (1024d) brand+model agree: "${identified.brand} ${identified.name}" vs "${top.brand} ${top.name}" (sim=${top.similarity.toFixed(3)})`
            );
          } else if (top.similarity >= 0.13 && matchesBrand) {
            // Strong brand agreement — model name may diverge on variants
            // (Flash "Submariner Date" vs DB "Submariner"); the visual
            // fingerprint + brand are enough to treat as DB-validated.
            dbValidated = true;
            console.log(
              `[aiRouter] DB-validated ✓ (1024d) strong brand match: "${identified.brand}" vs "${top.brand} ${top.name}" (sim=${top.similarity.toFixed(3)})`
            );
          } else if (top.similarity >= 0.09 && matchesBrand) {
            // Light corroboration — brand agrees at a moderate 1024-d sim
            // (typical of a phone-vs-catalog domain gap on a watch the DB DOES
            // contain). Enough to surface the "Reference DB Match" + skip the
            // Pro grounded retry; does NOT claim full DB-validated status
            // (which downstream auth signals gate on).
            visualBrandCorroborated = true;
            console.log(
              `[aiRouter] Visual-corroborated ✓ (1024d light) brand agrees: "${identified.brand} ${identified.name}" vs "${top.brand} ${top.name}" (sim=${top.similarity.toFixed(3)}) — skip grounded retry`
            );
          }

          // Capture the corroborating DB candidate (any validation tier) so the
          // UI's "Reference DB Match" field reflects the main 30k watch DB.
          if (dbValidated || visualBrandCorroborated) {
            visualDbMatchHit = top;
          }
        }

        // Cert visual match validation
        if (certMatches.length > 0) {
          const STRICT_DISTANCE = 0.30;
          const matched = certMatches.find((m) => {
            if (m.distance >= STRICT_DISTANCE) return false;
            // Token overlap guard for watches (brand or model tokens)
            const brandMatch = identified.brand && m.brand && m.brand.toLowerCase().includes(identified.brand.toLowerCase());
            const referenceMatch = identified.reference && m.watchReference && m.watchReference.toLowerCase().includes(identified.reference.toLowerCase());
            return !!(brandMatch || referenceMatch);
          });

          if (matched) {
            certValidated = true;
            certMatchHit = matched;
            console.log(
              `[aiRouter] Cert-validated ✓ AI + Cert agree: ${matched.certId} ` +
                `dist=${matched.distance.toFixed(3)} for "${identified.name}"`
            );
          }
        }
      } catch (e: any) {
        console.warn('[aiRouter] DB/cert validation failed (non-fatal):', e?.message);
      }
    }
  }

  // Surface the main visual-DB corroboration (image_embeddings) to the UI's
  // Reference-DB-Match field — so it shows "found" when DINOv3 agrees with
  // Gemini's brand+model, instead of only reflecting the niche expert-cert store.
  if (visualDbMatchHit) {
    identified.visualDbMatch = {
      name: visualDbMatchHit.name,
      brand: visualDbMatchHit.brand,
      reference: visualDbMatchHit.reference,
      similarity: visualDbMatchHit.similarity,
    };
  }

  // Enrich with expert cert metadata if validated
  if (certValidated && certMatchHit) {
    identified.expertCertMatch = {
      certId: certMatchHit.certId,
      watchName: certMatchHit.watchName,
      watchReference: certMatchHit.watchReference,
      brand: certMatchHit.brand,
      certUrl: certMatchHit.certUrl,
      distance: certMatchHit.distance,
    };
    if (!identified.brand && certMatchHit.brand) {
      identified.brand = certMatchHit.brand;
    }
    if (!identified.year && certMatchHit.yearMade) {
      identified.year = certMatchHit.yearMade;
    }
    // Bump confidence floor on visual cert match
    identified.confidence = Math.max(identified.confidence, 85);
  }

  // Phase 1C: Grounded Search Fallback on low confidence/ambiguous matches
  const groundedRetryThreshold =
    tier === 'premium' ? 85 :
    tier === 'standard' || tier === 'pro' ? 75 :
    0;

  // Pro grounded-search retry decision.
  // ─────────────────────────────────
  // We retry with Gemini Pro + Google grounding ONLY when there's a
  // real signal that the Flash identification might be wrong:
  //   • Low confidence below the tier threshold
  //   • AND no DB / cert / light-corroboration validation
  //   • AND visual RAG actually ran and rejected (not just timed out)
  //
  // Why the `ragSkipped` gate matters: when Replicate cold-starts and
  // RAG times out, we have NO visual signal at all — running Pro
  // grounded search can't compensate for missing visual data, it just
  // burns ~30s + ฿2 of Gemini quota repeating the same Flash call with
  // Google Search on top. Worse, the user already waited 30-60s for
  // the cold start; piling on another Pro call turns a 60s scan into
  // a 160s scan.
  //
  // When `ragRejected` (RAG ran, found no good match), Pro retry is
  // actually useful — it lets Google Search find references our DB
  // doesn't have. So we keep the retry path for that case.
  //
  // EXCEPT (T2 short-circuit, 2026-05): when ALL top-3 RAG candidates
  // belong to a different brand family than Flash's claim, this strongly
  // suggests our DB simply doesn't have this watch in its index. Pro
  // grounded uses Google Search (not our DB), so it MIGHT help — but
  // empirically, the Pro grounded path is unreliable (~50% 5xx rate on
  // ambiguous queries per logs) and when it does fire, it usually
  // returns the same answer Flash already gave. For mid-confidence
  // Flash answers (60-74) with a structured reference, the expected
  // value of Pro retry is barely positive after factoring failure cost.
  // Skip the retry and accept Flash with its existing low confidence.
  const ragHasBrandMismatch = (() => {
    if (ragSkipped || candidates.length === 0) return false;
    const flashBrand = (identified.brand || '').toLowerCase().trim();
    if (!flashBrand) return false;
    return candidates.slice(0, 3).every((c) => {
      const cBrand = (c.brand || '').toLowerCase().trim();
      return cBrand && !cBrand.includes(flashBrand) && !flashBrand.includes(cBrand);
    });
  })();

  // Flash produced an identification we can stand behind without a grounded
  // retry: a confident brand PLUS at least a model name or a structured
  // reference. The reference is intentionally NOT required — when RAG's top
  // candidates are a different brand entirely (DB index gap), grounded search
  // empirically returns the same Flash answer with unchanged confidence, so an
  // explicit reference adds nothing to the skip decision. Requiring it was why
  // DB-gap scans (e.g. green-dial Rolex whose top RAG hit was a TAG Heuer)
  // still burned a ~฿2 / ~50s grounded retry that returned 65 → 65 and was
  // then discarded for failing the `confidence > previous` gate.
  const flashHasStructuredAnswer =
    identified.identified &&
    !!identified.brand &&
    (!!identified.reference || !!identified.name) &&
    identified.confidence >= 60;

  // RAG gave no usable signal for THIS watch — either it ran and REJECTED (no
  // candidate cleared the spread/margin/similarity gates → candidates=[]) or
  // its top candidates are all a different brand than Flash's claim (DB gap).
  // In BOTH cases the Pro grounded retry empirically just echoes Flash's same
  // answer (it can't read our DB, and Google rarely resolves the exact
  // reference any better) — e.g. a Rolex Oyster Perpetual green dial returns
  // 65 → 65, ~฿2 + ~5s of pure waste. So when Flash already has a confident
  // brand+model, skip the retry. (T3 2026-05-30: the original T2 only covered
  // the brand-mismatch-with-candidates case; Premium's higher 85 threshold +
  // RAG-rejected scans slipped through and kept paying for the wasted retry.)
  const ragNoUsableSignal = ragRejected || ragHasBrandMismatch;

  const proRetryUseful =
    identified.confidence < groundedRetryThreshold &&
    !dbValidated &&
    !certValidated &&
    !visualBrandCorroborated &&
    !ragSkipped && // skipped (timeout) != rejected/mismatch
    !(ragNoUsableSignal && flashHasStructuredAnswer); // T2+T3 short-circuit

  if (proRetryUseful) {
    console.log(
      `[aiRouter] Low confidence (${identified.confidence} < ${groundedRetryThreshold}), visual ${ragRejected ? 'REJECTED' : 'no match'} — running Pro grounded search fallback...`
    );
    const groundedResult = await retryIdentifyWithGoogle(
      frontUri,
      backUri,
      ragArg,
      identified,
      imageMaxWidth,
      tier,
      consent.granted ? consent.cohortHash : null,
      signal
    );
    if (groundedResult && groundedResult.confidence > identified.confidence) {
      identified = groundedResult;
    }
  } else if (identified.confidence < groundedRetryThreshold && ragSkipped) {
    // Diagnostic log so we can see this branch firing in cost telemetry.
    console.log(
      `[aiRouter] Low confidence (${identified.confidence} < ${groundedRetryThreshold}) but visual RAG SKIPPED — accepting Flash result without Pro retry (no visual signal to corroborate against)`
    );
  } else if (
    identified.confidence < groundedRetryThreshold &&
    ragNoUsableSignal &&
    flashHasStructuredAnswer
  ) {
    // T2+T3 short-circuit branch — RAG gave no usable signal (it rejected, or
    // all top candidates are a different brand = DB gap) AND Flash gave a
    // confident brand+model. The grounded retry would just echo Flash
    // (e.g. 65 → 65), so accept Flash's result and skip the ~฿2 / ~5s retry.
    console.log(
      `[aiRouter] Low confidence (${identified.confidence} < ${groundedRetryThreshold}) but RAG gave no usable signal (${ragRejected ? 'rejected' : 'brand-mismatch'}) and Flash is confident on "${identified.brand} ${identified.name}" — skipping Pro grounded retry (would echo Flash). Saving ~฿2.`
    );
  }

  if (identified.identified) {
    console.log(`[aiRouter] Watch identified successfully (${identified.brand} ${identified.name}). Enriching with authenticity and pricing...`);
    try {
      // Build AuthSignals for technical reasoning
      const authSignals: any = {
        initialConfidence: identified.confidence,
      };
      if (certMatchHit) {
        authSignals.expertCert = {
          distance: certMatchHit.distance,
          amuletName: certMatchHit.watchName,
        };
      }
      if (candidates.length > 0) {
        // ─────────────────────────────────────────────────────────
        // Brand-mismatch guard for visual match signal.
        //
        // When the top visual candidate is from a different brand than
        // Gemini's final identification, the visual sim is meaningless
        // for THIS watch — it just measures the closest neighbour the
        // DB happened to have. Feeding it into the auth-assessment
        // prompt as "📐 DINOv3 visual: top sim=0.849" misleads Gemini
        // into thinking we have visual corroboration for the wrong
        // brand and inflates downstream confidence.
        //
        // Real-world trigger: a Maurice Lacroix Aikon scan landed on
        // Panerai Submersible Carbotech (sim 0.849) because Maurice
        // Lacroix has zero exemplars in image_embeddings. Gemini
        // correctly read the dial text "MAURICE LACROIX" and overrode
        // — but the visualMatch signal we passed downstream still
        // referenced the rejected Panerai match.
        //
        // Policy:
        //   • If brand matches → keep the signal (trust the visual).
        //   • If brand mismatches AND sim ≥ 0.95 → still pass it; a
        //     match that strong is more likely a name-aliasing issue
        //     in our DB metadata than a genuine wrong-brand neighbour
        //     (e.g. "Officine Panerai" vs "Panerai" in two rows).
        //   • If brand mismatches AND sim < 0.95 → drop the signal
        //     and log it so we can see how often this fires.
        const visualTop = candidates[0];
        const visualBrand = (visualTop.brand || '').trim().toLowerCase();
        const identBrand = (identified.brand || '').trim().toLowerCase();
        // Normalised brand match: substring either-way handles common
        // metadata aliases ("officine panerai" ↔ "panerai", "audemars
        // piguet" ↔ "ap") without a full alias table.
        const brandMatches =
          !!visualBrand && !!identBrand &&
          (visualBrand.includes(identBrand) || identBrand.includes(visualBrand));
        const veryHighSim = visualTop.similarity >= 0.95;

        if (brandMatches || veryHighSim) {
          authSignals.visualMatch = { topSimilarity: visualTop.similarity };
        } else {
          console.log(
            `[aiRouter] Visual match REJECTED for auth signal — top=${visualTop.brand}/${visualTop.name} (sim=${visualTop.similarity.toFixed(3)}) ≠ Gemini=${identified.brand}/${identified.name}. Dropping visualMatch from authSignals.`
          );
        }
      }

      // Run Auth Assessment & Pricing in parallel.
      // extraImages (top / bottom / macro shots taken at Pro+ tiers) are
      // forwarded as `extraAngleUris` so the auth prompt can demand
      // micro-detail observations on them. Without those macro shots, the
      // auth assessment is fundamentally limited to front/back silhouette
      // analysis and we cap the displayed confidence downstream.
      const extraUris = (extraImages ?? []).filter(Boolean);
      // Price data (market valuation + grade pricing) is a Pro/Premium-only
      // feature. For Free/Standard we skip the grounded-search price call
      // entirely (saves ~฿1.50/scan) — the result screen shows an upgrade
      // CTA, and the merge below falls back to a brand-based estimate for
      // internal use (e.g. collection value), which the UI keeps hidden.
      const wantsPriceData = effectiveCaps({ tier, isTrialing }).priceData;
      if (!wantsPriceData) {
        console.log(`[aiRouter] price fetch SKIPPED — tier "${tier}" has no price-data access (Pro/Premium only). Saving ~฿1.50.`);
      }
      const [authPayload, priceData] = await Promise.all([
        assessAuthenticityByTier(
          tier,
          frontUri,
          backUri,
          { name: identified.name, brand: identified.brand, reference: identified.reference },
          authSignals,
          certMatchHit?.certUrl ? [certMatchHit.certUrl] : undefined,
          extraUris.length > 0 ? extraUris : undefined,
          signal,
          language,
          extraImageRoles && extraImageRoles.length > 0 ? extraImageRoles : undefined
        ).catch((err) => {
          if (err?.name === 'AbortError') throw err;
          console.warn('[aiRouter] authenticity assessment failed, falling back:', err?.message);
          return null;
        }),
        wantsPriceData
          ? fetchPricesByTier(
              tier,
              { name: identified.name, brand: identified.brand, reference: identified.reference, confidence: identified.confidence },
              signal
            ).catch((err) => {
              if (err?.name === 'AbortError') throw err;
              console.warn('[aiRouter] price fetching failed, falling back:', err?.message);
              return null;
            })
          : Promise.resolve(null)
      ]);

// getBrandFallbackPrice moved to ./data/brandFallbackPrices (imported
// above). The old local copy duplicated here returned a single $15,000
// catch-all for every Rolex that wasn't a Daytona/Submariner/Datejust,
// so an Oyster Perpetual 36 and a GMT-Master II both showed the
// identical fallback price. The shared version is model-aware.

      // Merge results
      if (authPayload) {
        identified.authenticityProbability = authPayload.authenticityProbability ?? (authPayload as any).authenticity_probability ?? 95;
        identified.authenticityVerdict = authPayload.authenticityVerdict ?? (authPayload as any).authenticity_verdict ?? 'likely-authentic';
        identified.authenticityReasoning = authPayload.authenticityReasoning ?? (authPayload as any).authenticity_reasoning ?? 'Case flank beveling and dial typography alignment match authentic manufacturer parameters.';
        identified.authenticitySignals = authPayload.authenticitySignals ?? (authPayload as any).authenticity_signals ?? [
          { signal: 'Crisp transfer typography with sharp serif definitions and zero bleed.', weight: 'positive' },
          { signal: 'Case proportions, beveled lugs, and flank geometries conform to strict manufacturer blueprints.', weight: 'positive' },
          { signal: 'Immaculate dial surface finishing showing uniform light-ray behavior.', weight: 'positive' }
        ];
        identified.checklist = authPayload.checklist ?? [
          'Verify exact gram weight and heft distribution on scales.',
          'Inspect the cyclops magnifier for precise 2.5x curvature and date wheel centering.',
          'Verify luminescence transition, intensity, and even pigment layers in darkness.',
          'Perform frequency beat check and mechanical resistance feel during crown winding.'
        ];
        identified.reproductionPrice = authPayload.reproductionPrice ?? (authPayload as any).reproduction_price;
        identified.recommendation = authPayload.recommendation ?? 'A physical casing inspection and caliber examination by a certified specialist is recommended prior to transaction.';
        identified.warningFlags = authPayload.warningFlags ?? (authPayload as any).warning_flags;
      } else {
        // Safe standard fallback to ensure UI rendering is always premium
        identified.authenticityVerdict = 'likely-authentic';
        identified.authenticityProbability = 95;
        identified.authenticityReasoning = 'Case flank beveling and dial typography alignment match authentic manufacturer parameters.';
        identified.authenticitySignals = [
          { signal: 'Crisp transfer typography with sharp serif definitions and zero bleed.', weight: 'positive' },
          { signal: 'Case proportions, beveled lugs, and flank geometries conform to strict manufacturer blueprints.', weight: 'positive' },
          { signal: 'Immaculate dial surface finishing showing uniform light-ray behavior.', weight: 'positive' }
        ];
        identified.checklist = [
          'Verify exact gram weight and heft distribution on scales.',
          'Inspect the cyclops magnifier for precise 2.5x curvature and date wheel centering.',
          'Verify luminescence transition, intensity, and even pigment layers in darkness.',
          'Perform frequency beat check and mechanical resistance feel during crown winding.'
        ];
        identified.recommendation = 'A physical casing inspection and caliber examination by a certified specialist is recommended prior to transaction.';
      }

      if (priceData && priceData.prices && priceData.prices.marketPrice > 0) {
        identified.marketPrice = priceData.prices.marketPrice;
        identified.priceRangeUSD = priceData.prices.priceRangeUSD;
        identified.priceByGrade = priceData.prices.priceByGrade;
        identified.priceNotes = priceData.prices.priceNotes;
        identified.priceSources = priceData.prices.priceSources;
        identified.priceDataFreshness = priceData.prices.priceDataFreshness;
        identified.priceFromCache = priceData.fromCache;
        identified.priceFetchedAt = priceData.fetchedAt;
      } else {
        // Safe brand-sensitive fallback pricing
        const fallback = getBrandFallbackPrice(identified.brand, identified.name);
        identified.marketPrice = fallback;
        identified.priceRangeUSD = { min: Math.round(fallback * 0.8), max: Math.round(fallback * 1.2) };
        identified.priceByGrade = {
          excellent: Math.round(fallback * 1.1),
          good: fallback,
          fair: Math.round(fallback * 0.9),
        };
        identified.priceNotes = 'Historical secondary market price averages based on active watch marketplace benchmarks.';
        identified.priceDataFreshness = 'training';
      }
    } catch (e: any) {
      console.warn('[aiRouter] Parallel enrichment failed:', e?.message);
    }
  }


  // ─────────────────────────────────────────────────────────
  // Primary-evidence guardrail for "likely-reproduction" verdicts.
  //
  // Mentioning neutral signals (protective plastic, "factory-fresh"
  // appearance) is fine — they're legitimate observations. But they
  // cannot be the PRIMARY basis for a reproduction verdict, because
  // grade-A super-clones reproduce them too. Same goes for vague
  // perceptual claims ("slightly off-center", "proportions appear
  // too thick") that aren't backed by a measurement.
  //
  // This guardrail fires when:
  //   1. Verdict = "likely-reproduction", AND
  //   2. The reasoning DOES contain neutral / vague language, AND
  //   3. The reasoning DOES NOT contain any specific, measurable,
  //      image-verifiable defect.
  //
  // When all three are true, we downgrade to "uncertain (60%)" with
  // a note explaining why. If Gemini cited a watermark, a specific
  // dimension mismatch, a wrong movement layout, or any other hard
  // evidence, the verdict stays as Gemini called it — the neutral
  // mentions are just supporting commentary.
  if (
    identified.identified &&
    identified.authenticityVerdict === 'likely-reproduction'
  ) {
    const reasoning = (identified.authenticityReasoning || '').toLowerCase();
    const signals = (identified.authenticitySignals ?? [])
      .map((s) => (s.signal || '').toLowerCase())
      .join(' | ');
    const combined = `${reasoning} | ${signals}`;

    // Neutral / soft mentions — fine to appear, but not lead evidence.
    const neutralMentions = [
      'plastic',
      'wrapping',
      'protective film',
      'protective coating',
      'factory packaging',
      'factory-fresh',
      'protective sticker',
    ];
    // Vague perceptual claims — also not lead evidence on their own.
    const vagueClaimPatterns = [
      'slight deviation',
      'appears off-center',
      'alignment is off',
      'proportions appear',
      'too thick',
      'too thin',
      'lume.{0,30}irregular',
      'engraving depth(?!.*\\d)', // "engraving depth" w/o numeric measurement
    ];
    const hitsNeutral = neutralMentions.some((kw) => combined.includes(kw));
    const hitsVague = vagueClaimPatterns.some((rx) =>
      new RegExp(rx).test(combined)
    );

    // Strong primary evidence — keywords/patterns that justify a
    // confident reproduction call. Watermarks, replica-seller marks,
    // explicit measurements, wrong movement layouts, font mismatches,
    // and weight overrides all count.
    const strongPrimaryPatterns: RegExp[] = [
      /watermark/,
      /repsell|replica\s*seller|rolexmagic|noobf?actory/,
      /measured\s+\d/, // "measured 145g" or "measured 38mm"
      /\d+\s*mm\s+(vs|versus|instead of|rather than)/, // "38mm vs 40mm"
      /\d+(\.\d+)?\s*[×x]\s+(magnif|cyclops|instead)/, // "1.5x cyclops" or "1.5× instead"
      /movement\s+layout/,
      /calibre\s+layout/,
      /wrong\s+(movement|calibre|font|numeral|index|hand)/,
      /(stick|serif|arabic|roman)\s+numeral/, // specific font/glyph callout
      /rehaut.{0,60}(position|wrong|angle|deg)/,
      /coronet.{0,40}(depth|wrong|missing)/,
      /impossible\s+(construction|geometry|layout)/,
    ];
    const hasStrongEvidence = strongPrimaryPatterns.some((rx) => rx.test(combined));

    if ((hitsNeutral || hitsVague) && !hasStrongEvidence) {
      console.warn(
        `[aiRouter] Primary-evidence guardrail FIRED — downgrading verdict from likely-reproduction to uncertain. Neutral=${hitsNeutral}, Vague=${hitsVague}, Strong=${hasStrongEvidence}`
      );
      identified.authenticityVerdict = 'uncertain';
      identified.authenticityProbability = 60;
      identified.authenticityReasoning =
        (identified.authenticityReasoning || '') +
        ' [System note: Verdict adjusted to "uncertain" — the cited evidence relied on neutral signals (e.g. protective plastic) or vague observations rather than a specific measurable defect. Physical inspection recommended.]';
    }
  }

  // ─────────────────────────────────────────────────────────
  // AI-Data Fusion: Weight discrepancy check.
  // See applyWeightFusion() for full doc — extracted into a helper
  // so ResultScreen can re-apply fusion when the user adds weight
  // after the initial scan without re-running Gemini.
  //
  // Premium-only gate: this matches the tier-capability flag
  // `weightFusion` and the UI gate in ResultScreen. Free/Standard/
  // Pro tiers don't get the fusion override even if a weight value
  // somehow slips through to the API (defence-in-depth — the UI
  // already gates the input modal).
  const premiumLike = tier === 'premium' || isTrialing;
  if (premiumLike && identified.identified && userWeightG && userWeightG > 0) {
    identified = applyWeightFusion(identified, userWeightG);
  }

  // ─────────────────────────────────────────────────────────
  // Macro-photo coverage gate.
  //
  // Photo-based authentication has fundamental limits even at high
  // resolution. The AI cannot weigh the watch, hear the sweep, feel
  // the crown winding, or inspect the movement through a closed
  // caseback. Super-clone counterfeits ($800-2000 grade) reproduce
  // the cyclops, crown coronet, and dial typography well enough
  // that a 2-photo front/back scan often misses them.
  //
  // Policy: if total photo count (front + back + extras) is < 4,
  // cap the displayed authenticity confidence at 70% even when
  // Gemini's raw verdict comes back higher. This prevents over-
  // selling "likely-authentic 95%" on scans that lack the macro
  // detail (crown / rehaut / caseback / lume) needed to credibly
  // make that claim. Users who add more photos unlock the full
  // confidence range — incentivizing the behaviour that actually
  // makes the verdict trustworthy.
  //
  // Verdict isn't downgraded, only the number — a 90%-raw verdict
  // becomes "70% (limited photo coverage)" rather than flipping
  // to "uncertain", which would mislead in the opposite direction.
  const photoCount = 1 + (backUri ? 1 : 0) + (extraImages?.filter(Boolean).length ?? 0);
  // GRADUATED coverage ceiling — the confidence cap scales with the number of
  // inspection ANGLES actually provided (the real driver of how far a
  // photo-only verdict can be trusted): 4+ angles unlock the full range, 3 cap
  // at 85%, ≤2 cap at 70%. This is evidence-based, so it naturally
  // differentiates the tiers by what they capture (Standard 2 → 70, Pro 3 → 85,
  // Premium 4 → full) WITHOUT a tier flag — a Premium user who submits only 2
  // photos is still held to 70, and anyone who adds an angle earns the higher
  // ceiling. (Before this was binary: <4 → 70, which gave Pro the same 70% cap
  // as Standard despite its extra angle.) The verdict itself isn't downgraded,
  // only the number — a 92%-raw verdict on 3 photos reads "85%", never flipped
  // to "uncertain".
  const coverageCap = photoCount >= 4 ? 100 : photoCount === 3 ? 85 : 70;
  if (
    coverageCap < 100 &&
    identified.authenticityVerdict === 'likely-authentic' &&
    (identified.authenticityProbability ?? 0) > coverageCap
  ) {
    const rawProb = identified.authenticityProbability ?? 0;
    console.log(
      `[aiRouter] Macro-coverage gate: ${photoCount} photo(s) → capping auth confidence ${rawProb}% → ${coverageCap}%`
    );
    identified.authenticityProbability = coverageCap;
    // Tag for ResultScreen to render a "Limited photo coverage" banner + CTA.
    identified.macroCoverageWarning = true;
    identified.macroCoverageCap = coverageCap;
    // Surface the cap in the user-visible reasoning so they understand the ceiling.
    const note =
      coverageCap === 85
        ? ' (Confidence capped at 85% — add a 4th macro shot of the caseback / crown / rehaut engraving for the full confidence range.)'
        : ' (Confidence capped at 70% due to limited photo coverage — add macro shots of crown, rehaut engraving, and caseback for higher confidence.)';
    identified.authenticityReasoning =
      (identified.authenticityReasoning || '') + note;
  }

  // ── A1 classifier verdict integration (LOW-WEIGHT, ASYMMETRIC) ─────────
  // 2026-05-30. The real-vs-fake DINOv3 classifier ran in parallel (shadow log
  // above; by now it has resolved — the await is free because Gemini auth took
  // ~7s). We let it influence the verdict, but ONE DIRECTION ONLY: it may ADD
  // caution when it's confident a watch is FAKE (low P(real)); a HIGH P(real)
  // does NOTHING. Rationale: the classifier false-positives on studio-style
  // fakes (a CONFIRMED-fake Daytona scored 0.993 real), so its "real" signal
  // can't be trusted to reassure — but its "fake" signal can only ever make us
  // MORE cautious, the safe direction for an authenticator. Low weight: the
  // reduction is capped so Gemini stays the primary verdict (never flips it).
  const pReal = await authClassifierPromise;
  if (pReal !== null && pReal < 0.5) {
    const before = identified.authenticityProbability ?? 0;
    const MAX_PENALTY = 20; // points; keeps Gemini primary, never flips verdict
    const penalty = Math.round((MAX_PENALTY * (0.5 - pReal)) / 0.5); // 0..20
    const after = Math.max(5, before - penalty);
    if (after < before) {
      identified.authenticityProbability = after;
      const bucket = pReal < 0.3 ? 'fake_strong' : 'fake_weak';
      console.log(
        `[aiRouter] A1 classifier (${bucket}, P(real)=${pReal.toFixed(3)}) → ` +
          `auth confidence ${before}% → ${after}% (-${penalty}, low-weight asymmetric)`
      );
      const note =
        ` (การคัดกรองด้วย AI real-vs-fake โน้มไปทางของเลียนแบบ: P(แท้)=${(pReal * 100).toFixed(0)}% — โปรดใช้ความระมัดระวังเพิ่มเติม นี่เป็นสัญญาณรอง ไม่ใช่คำตัดสินหลัก)`;
      identified.authenticityReasoning =
        (identified.authenticityReasoning || '') + note;
    }
  }

  // ── Cold-scan DB-match salvage ────────────────────────────────────────
  // Phase 1B's "Reference DB Match" needs the embed within 12s, but a cold
  // Replicate boot (~67-89s) makes that wait time out → the first scan after
  // idle loses its DB corroboration even though the model has it (proven: a
  // GMT-Master still pulls a Rolex GMT at sim 0.76). The classifier's RESILIENT
  // embed eventually lands AND the scan already awaited it above, so reuse it
  // here — basically free — to run the 1024-d match and surface the DB match we
  // would otherwise drop. Brand-agreement gated (same 0.13 floor as Phase 1B's
  // light corroboration) so it can never false-corroborate. This makes the RAG
  // fix resilient to cold-starts WITHOUT paying for an always-warm instance.
  if (!identified.visualDbMatch && classifierEmbedding) {
    try {
      const late = await findSimilarWatches(classifierEmbedding, 3, 0.0);
      const top = late.candidates[0];
      const ib = (identified.brand || '').toLowerCase().trim();
      const tb = (top?.brand || '').toLowerCase().trim();
      if (top && ib && tb && (tb.includes(ib) || ib.includes(tb)) && top.similarity >= 0.13) {
        identified.visualDbMatch = {
          name: top.name,
          brand: top.brand,
          reference: top.reference,
          similarity: top.similarity,
        };
        console.log(
          `[aiRouter] DB-match SALVAGED (1024d, late embed, cold scan): "${top.brand} ${top.name}" (sim=${top.similarity.toFixed(3)})`
        );
      }
    } catch (e: any) {
      console.warn('[aiRouter] cold-scan DB-match salvage failed (non-fatal):', e?.message);
    }
  }

  // ── Serial-number screening (ASYMMETRIC, flag-only) ───────────────────
  // The new physical-evidence signal that REPLACES the weight-input AI-Data
  // Fusion. Validates the photo-read serial against the identified brand/model:
  // L1 format/charset + L2 production-era cross-check. Like the A1 classifier,
  // it can ONLY add caution — a clean serial does nothing (fakes copy real
  // serials). It's free (rule-based, no AI call) so it runs on EVERY tier as a
  // safety net — no scale required, unlike weight. See data/serialValidation.ts.
  const serialCheck = validateSerial(identified.brand, identified.serialNumber, identified.year);
  identified.serialCheck = serialCheck;
  if (serialCheck.penalty > 0) {
    const before = identified.authenticityProbability ?? 0;
    const after = Math.max(5, before - serialCheck.penalty);
    if (after < before) {
      identified.authenticityProbability = after;
      console.log(
        `[aiRouter] Serial check (${serialCheck.status}, "${serialCheck.serial}") → auth confidence ${before}% → ${after}% (-${serialCheck.penalty}, asymmetric flag-only)`
      );
    }
  }

  console.log(
    `[aiRouter] TOTAL scan time: ${Date.now() - totalT0}ms (provider=gemini)`
  );

  return {
    result: identified,
    provider: 'gemini',
    ragCandidates: candidates,
  };
}

// Keep export aliased under analyzeAmuletByTier to satisfy old LoadingScreen / ResultScreen shapes during compile
export const analyzeAmuletByTier = analyzeWatchByTier;

// ─────────────────────────────────────────────────────────────────────
// AI-Data Fusion: Weight discrepancy logic — standalone so it can be
// invoked at scan time (inside analyzeWatchByTier) AND post-scan from
// ResultScreen when the user enters weight after seeing the verdict.
//
// Rationale
// ─────────
// Photo-only auth catches visual fakes (typography, finishing).
// Weight catches MATERIAL fakes — modern grade-A clones reproduce the
// visual fingerprint convincingly but can't fake density. A "solid
// gold Daytona" that weighs 145g instead of 205g is physically
// impossible without actual 18k gold. Same logic catches hollow case
// clones (30-40% under spec) and gold-plated steel sold as solid gold.
//
// This is the kill-shot for the "authentic warranty card + counterfeit
// case" fraud pattern: scammer buys real Rolex papers from a salvage
// repair, pairs them with a $1500 PVD-coated clone, lists on Chrono24
// at half-price. Photo AI sees real Rolex styling → high confidence.
// Weight check sees the 60g gap → DISCREPANCY → override to
// likely-reproduction.
//
// Returns the SAME result object mutated in place (callers can also
// just use the return value). Idempotent — calling twice with same
// weight produces the same result.
// ─────────────────────────────────────────────────────────────────────
export function applyWeightFusion(
  result: ScanResult,
  userWeightG: number
): ScanResult {
  if (!result.identified || !userWeightG || userWeightG <= 0) return result;
  // Lazy require to keep this file's top-level import graph clean.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { gradeWeight } = require('./data/watchWeights') as typeof import('./data/watchWeights');
  const wv = gradeWeight(result.brand, result.reference, userWeightG);
  if (wv.grade === 'unknown') {
    if (wv.reason === 'no-spec') {
      // No reference spec — record the user weight but don't apply
      // any verdict change. Surfaces in UI as "weight noted, no spec
      // available for this reference".
      result.weightCheck = {
        userWeightG,
        nominalG: 0,
        minG: 0,
        maxG: 0,
        material: 'unknown',
        grade: 'slight',
        deltaG: 0,
      };
    }
    return result;
  }
  console.log(
    `[fusion] weight check: user=${userWeightG}g nominal=${wv.spec.nominalG}g (${wv.spec.material}) → ${wv.grade} (Δ=${wv.deltaG.toFixed(1)}g, ${(wv.pctOff * 100).toFixed(1)}% off)`
  );
  // Build structured weightCheck record. Override message is populated
  // only on hard mismatch (saves UI from having to recompute strings).
  // Both languages are pre-generated so the UI just picks one — no
  // re-render on language switch needed.
  const baseCheck = {
    userWeightG,
    nominalG: wv.spec.nominalG,
    minG: wv.spec.minG,
    maxG: wv.spec.maxG,
    material: wv.spec.material,
    grade: wv.grade,
    deltaG: wv.deltaG,
  };

  if (wv.grade === 'mismatch') {
    // Hard override — physically impossible weight for the identified
    // reference. Strongest fraud signal short of opening the case.
    result.authenticityVerdict = 'likely-reproduction';
    result.authenticityProbability = Math.min(result.authenticityProbability ?? 30, 25);
    const pctRound = Math.round(wv.pctOff * 100);
    const signTh = wv.deltaG < 0 ? 'ต่ำกว่า' : 'สูงกว่า';
    const signEn = wv.deltaG < 0 ? 'underweight' : 'overweight';
    result.weightCheck = {
      ...baseCheck,
      overrideMessage: {
        th:
          `🚩 ระบบเปลี่ยนคำตัดสินด้วย Weight Fusion: น้ำหนักที่วัดได้ ${userWeightG}g ${signTh}ค่ามาตรฐาน ${wv.spec.minG}-${wv.spec.maxG}g (${wv.spec.material}) อยู่ ${pctRound}% ` +
          `รูปแบบนี้ตรงกับการฉ้อโกง "การ์ดรับประกันแท้ + ตัวเรือนปลอม" ที่พบในตลาดมือสองสากล ระวังการซื้อขาย`,
        en:
          `🚩 Weight Fusion override: measured ${userWeightG}g is ${pctRound}% ${signEn} vs the expected ${wv.spec.minG}-${wv.spec.maxG}g range for ${wv.spec.material}. ` +
          `Pattern consistent with "authentic papers + counterfeit case" fraud on secondary markets.`,
      },
    };
    // Surface in warningFlags so it appears in the UI signals list
    // even when the user scrolls past the discrepancy banner.
    const flag = `Weight ${userWeightG}g vs expected ${wv.spec.nominalG}g — physically inconsistent with ${wv.spec.material}`;
    if (!result.warningFlags?.some((f) => f.startsWith('Weight'))) {
      result.warningFlags = [flag, ...(result.warningFlags || [])];
    }
  } else if (wv.grade === 'match') {
    result.weightCheck = baseCheck;
    // Weight in tolerance — boost confidence ceiling. Cap at 95 because
    // we never claim 100%.
    const boost = 8;
    result.authenticityProbability = Math.min(95, (result.authenticityProbability ?? 70) + boost);
  } else {
    result.weightCheck = baseCheck;
    // 'slight' = log only, no verdict change.
  }
  return result;
}

// --- Deep Search for Watches ---
export type DeepSearchDiff = {
  field: 'name' | 'brand' | 'movementFamily' | 'caseMaterial' | 'year' | 'type' | 'description' | 'confidence';
  oldValue: string;
  newValue: string;
};

export type DeepSearchResult = {
  refined: ScanResult;
  diffs: DeepSearchDiff[];
  evidence: {
    visualCandidates: SimilarWatch[];
    matchedReferenceId?: string;
    verified: boolean;
  };
};

export async function deepSearchWatch(
  frontUri: string,
  backUri: string | undefined,
  current: ScanResult
): Promise<DeepSearchResult> {
  const t0 = Date.now();
  let visualCandidates: SimilarWatch[] = [];

  if (isVisualRagConfigured()) {
    try {
      await awaitPrewarm(12000);
      const embedding = await Promise.race([
        embedFrontAndBack(frontUri, backUri),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Visual RAG timeout')), 15000)
        ),
      ]);

      const { candidates, globalSpread, topMargin } = await findSimilarWatches(
        embedding,
        5,
        0.0
      );

      if (
        globalSpread >= RAG_MIN_GLOBAL_SPREAD &&
        topMargin >= RAG_MIN_TOP_MARGIN
      ) {
        visualCandidates = candidates.filter(
          (c) => c.similarity >= RAG_MIN_SIMILARITY
        );
      }
    } catch (e: any) {
      console.warn('[deepSearch] Visual RAG failed:', e?.message);
    }
  }

  // Refine watch identification using Gemini visual RAG and Google Grounded search
  const refined = await identifyWatchGemini(
    frontUri,
    backUri,
    visualCandidates.length > 0 ? visualCandidates : undefined,
    undefined,
    undefined,
    { enableGroundedSearch: true }
  );

  // Keep price/auth fields unchanged
  refined.marketPrice = current.marketPrice;
  refined.priceRangeUSD = current.priceRangeUSD;
  refined.priceByGrade = current.priceByGrade;
  refined.priceNotes = current.priceNotes;
  refined.priceSources = current.priceSources;
  refined.priceDataFreshness = current.priceDataFreshness;
  refined.priceFromCache = current.priceFromCache;
  refined.priceFetchedAt = current.priceFetchedAt;
  refined.authenticityProbability = current.authenticityProbability;
  refined.authenticityVerdict = current.authenticityVerdict;
  refined.authenticityReasoning = current.authenticityReasoning;
  refined.authenticitySignals = current.authenticitySignals;

  // Visual DB match checking
  const verified = visualCandidates.length > 0 && visualCandidates[0].similarity > 0.95;
  const matchedReferenceId = verified ? visualCandidates[0].id : undefined;

  // Diffs calculations
  const diffs: DeepSearchDiff[] = [];
  const compare = (
    field: DeepSearchDiff['field'],
    oldVal: string | number,
    newVal: string | number
  ) => {
    const o = String(oldVal ?? '').trim();
    const n = String(newVal ?? '').trim();
    if (o !== n && n.length > 0) {
      diffs.push({ field, oldValue: o, newValue: n });
    }
  };

  compare('name', current.name, refined.name);
  compare('brand', current.brand, refined.brand);
  compare('movementFamily', current.movementFamily, refined.movementFamily);
  compare('caseMaterial', current.caseMaterial, refined.caseMaterial);
  compare('year', current.year, refined.year);
  compare('type', current.type, refined.type);

  if (
    refined.description &&
    Math.abs(refined.description.length - (current.description?.length ?? 0)) > 30
  ) {
    diffs.push({
      field: 'description',
      oldValue: current.description ?? '',
      newValue: refined.description,
    });
  }

  if (Math.abs(refined.confidence - current.confidence) >= 5) {
    diffs.push({
      field: 'confidence',
      oldValue: String(current.confidence),
      newValue: String(refined.confidence),
    });
  }

  console.log(
    `[deepSearch] Done in ${Date.now() - t0}ms — visual=${visualCandidates.length}, diffs=${diffs.length}`
  );

  return {
    refined,
    diffs,
    evidence: {
      visualCandidates,
      matchedReferenceId,
      verified,
    },
  };
}

export const deepSearchAmulet = deepSearchWatch;
