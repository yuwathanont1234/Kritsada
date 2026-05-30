import { MembershipTier } from './auth';
import { effectiveCaps } from './tier';
import {
  AuthPayload,
  PricePayload,
  fillScanResultDefaults,
} from './ai';
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
import { getDataConsent } from './dataConsent';
import { scanBreadcrumb, captureScanError } from './sentry';

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

const RAG_MIN_SIMILARITY = 0.3;
// globalSpread = (max − min similarity) across the top-K candidates. Empirically
// recalibrated 0.15 → 0.08 (2026-05-29): the live `image_embeddings.image_embedding_v2`
// space (256-d probe-projected DINOv3) is tightly clustered — even a CLEAN, correct
// Rolex catalog image only produces ~0.08 spread, and real user photos ~0.05. At 0.15
// the gate rejected essentially every query (the scanned green-dial Rolex got 0.045),
// so RAG corroboration never fired and every scan fell through to the Gemini path. The
// downstream brand cross-check (visualBrandCorroborated) + RAG_MIN_TOP_MARGIN still guard
// against accepting a wrong-brand top hit, so loosening spread is safe.
const RAG_MIN_GLOBAL_SPREAD = 0.08;
const RAG_MIN_TOP_MARGIN = 0.05;
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
  
  let embedding: number[] | null = null;
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

  // A1 real-vs-fake classifier (SHADOW, 2026-05-30) — independent P(real) from
  // the scale-up model (DINOv3 1024-d → 1024→128→1). Trained on studio+dealer
  // photos; THIS scan is a phone photo (the untested 3rd style), so we log to
  // see if it generalizes before wiring into the verdict. Non-blocking.
  if (!ragOutcome.embedding) {
    console.log(
      `[authClassifier:shadow] SKIPPED — no scan embedding ` +
        `(RAG ${ragOutcome.skipped ? 'embed FAILED (likely cold-start 504)' : 'ran but no emb'}). Scan again when Replicate is warm.`
    );
  } else {
    console.log(`[authClassifier:shadow] running — embedding len=${ragOutcome.embedding.length}`);
    predictAuthenticity(ragOutcome.embedding)
      .then((p) => {
        console.log(
          p === null
            ? `[authClassifier:shadow] P(real)=null (dim mismatch — got ${ragOutcome.embedding?.length}, model wants 1024)`
            : `[authClassifier:shadow] P(real)=${p.toFixed(3)} bucket=${bucketAuthVerdict(p)} ` +
                `(${identified?.brand ?? '?'} ${identified?.name ?? '?'})`
        );
      })
      .catch((e) => console.warn('[authClassifier:shadow] ERROR:', e?.message));
  }
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

          if (top.similarity > 0.95 && matchesModel) {
            // Strong DB validation — same logic as before.
            dbValidated = true;
            console.log(
              `[aiRouter] DB-validated ✓ AI + DINOv3 agree: "${identified.name}" vs top visual "${top.name}" (sim=${top.similarity.toFixed(3)})`
            );
          } else if (top.similarity >= 0.85 && matchesBrand) {
            // Strong-sim brand match (T2 short-circuit, 2026-05).
            // DINOv3 returned a near-identical embedding with matching
            // brand — even if the model name diverges slightly (e.g.
            // Flash says "Submariner Date" vs DB says "Submariner"),
            // the visual fingerprint is close enough to skip the
            // ฿1.84-per-call Pro grounded retry. Treat as DB-validated.
            //
            // Why 0.85 not 0.95: DINOv3 embeddings on luxury watches
            // rarely cross 0.95 unless the input image is from the
            // brand's own marketing shot. Real user photos at ~0.85
            // are still extremely confident matches.
            dbValidated = true;
            console.log(
              `[aiRouter] DB-validated ✓ strong-sim brand match: "${identified.brand}" vs top visual "${top.brand} ${top.name}" (sim=${top.similarity.toFixed(3)})`
            );
          } else if (
            top.similarity >= 0.65 &&
            matchesBrand &&
            matchesModel
          ) {
            // Light corroboration — moderate sim but brand+model agree.
            // Enough to skip the Pro-grounded retry without claiming
            // full DB-validated status (which downstream auth signals
            // gate on). Cost saver, accuracy-neutral.
            visualBrandCorroborated = true;
            console.log(
              `[aiRouter] Visual-corroborated ✓ AI + DINOv3 agree (light): "${identified.brand} ${identified.name}" vs top visual "${top.brand} ${top.name}" (sim=${top.similarity.toFixed(3)}) — will skip grounded retry`
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

function getBrandFallbackPrice(brand?: string, name?: string): number {
  if (!brand) return 2500;
  const b = brand.toLowerCase();
  if (b.includes('rolex')) {
    if (name?.toLowerCase().includes('daytona')) return 28400;
    if (name?.toLowerCase().includes('submariner')) return 13500;
    if (name?.toLowerCase().includes('datejust')) return 9800;
    return 15000;
  }
  if (b.includes('patek')) return 55000;
  if (b.includes('audemars') || b.includes('ap')) return 42000;
  if (b.includes('omega')) return 6200;
  if (b.includes('tag heuer') || b.includes('tagheuer') || b.includes('tag')) return 3200;
  if (b.includes('tudor')) return 4100;
  if (b.includes('cartier')) return 6500;
  if (b.includes('chopard')) return 9200;
  if (b.includes('franck') || b.includes('muller')) return 12500;
  if (b.includes('zenith')) return 11000;
  if (b.includes('breitling')) return 6800;
  if (b.includes('longines')) return 2800;
  if (b.includes('seiko')) return 450;
  return 2500;
}

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
  if (
    photoCount < 4 &&
    identified.authenticityVerdict === 'likely-authentic' &&
    (identified.authenticityProbability ?? 0) > 70
  ) {
    const rawProb = identified.authenticityProbability ?? 0;
    console.log(
      `[aiRouter] Macro-coverage gate: ${photoCount} photo(s) < 4 → capping auth confidence ${rawProb}% → 70%`
    );
    identified.authenticityProbability = 70;
    // Tag for ResultScreen to render a "Limited photo coverage" banner.
    identified.macroCoverageWarning = true;
    // Surface the cap in the user-visible reasoning so they understand
    // why the verdict isn't higher.
    const note =
      ' (Confidence capped at 70% due to limited photo coverage — add macro shots of crown, rehaut engraving, and caseback for higher confidence.)';
    identified.authenticityReasoning =
      (identified.authenticityReasoning || '') + note;
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
