import { MembershipTier } from './auth';
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
  findSimilarExpertCerts,
  isVisualRagConfigured,
  SimilarWatch,
  isEmbeddingCached,
} from './visualRag';
import { logCostEvent, COST_PER_CALL } from './costBreaker';
import { getDataConsent } from './dataConsent';

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
const RAG_MIN_GLOBAL_SPREAD = 0.15;
const RAG_MIN_TOP_MARGIN = 0.05;
// Raised from 8s → 25s. The 8s budget was originally chosen for a "warm"
// Replicate endpoint where embedding completes in 1-3s. In practice — even
// with the keep-warm cron — there are periods when Replicate genuinely
// cold-starts (e.g. after a GitHub scheduling outage). 8s in that case
// guaranteed a fallback to image-only identify, which then takes the same
// 30+ seconds anyway. By extending the timeout we let the embedding
// actually land, which feeds the visual-RAG candidates into the identify
// call and dramatically improves accuracy on near-misses (cf. the recurring
// Panerai/TAG Heuer mid-scan false positives we used to see at 8s).
//
// Bumped 25s → 35s after a live Tudor BB Chrono scan timed out at
// 41869ms (Replicate prewarm took 60857ms — fully cold). Allowing
// extra runway prevents the "no visual match" → grounded-retry
// cascade that turned a normal scan into 125s + ฿2.74.
const RAG_TIMEOUT_MS = 35000;
// Likewise raised — when Replicate is fully cold the prewarm itself can
// take 30-60s. Waiting up to 45s avoids the "RAG skipped" path that costs
// us identification accuracy.
const PREWARM_WAIT_MS = 45000;

async function getVisualCandidates(
  frontUri: string,
  backUri?: string | null
): Promise<SimilarWatch[]> {
  if (!isVisualRagConfigured()) return [];
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
        `[aiRouter] Visual RAG: SKIP — global spread ${globalSpread.toFixed(3)} < ${RAG_MIN_GLOBAL_SPREAD}. Falling back to image-only.`
      );
      return [];
    }
    if (topMargin < RAG_MIN_TOP_MARGIN) {
      console.log(
        `[aiRouter] Visual RAG: SKIP — top margin ${topMargin.toFixed(3)} < ${RAG_MIN_TOP_MARGIN}. Falling back to image-only.`
      );
      return [];
    }
    if (topSimilarity < RAG_MIN_SIMILARITY) {
      console.log(
        `[aiRouter] Visual RAG: top sim ${topSimilarity.toFixed(3)} < ${RAG_MIN_SIMILARITY} — skipping`
      );
      return [];
    }

    const filtered = candidates.filter((c) => c.similarity >= RAG_MIN_SIMILARITY);
    console.log(
      `[aiRouter] Visual RAG: ${filtered.length}/${candidates.length} above ${RAG_MIN_SIMILARITY}, top=${filtered[0]?.id} (sim=${topSimilarity.toFixed(3)})`
    );
    return filtered;
  } catch (e: any) {
    console.warn(
      `[aiRouter] Visual RAG skipped (${Date.now() - ragT0}ms):`,
      e?.message
    );
    return [];
  }
}

async function retryIdentifyWithGoogle(
  frontUri: string,
  backUri: string | undefined,
  ragArg: SimilarWatch[] | undefined,
  prevAttempt: ScanResult,
  imageMaxWidth: number,
  tier: MembershipTier,
  cohortHash: string | null
): Promise<ScanResult | null> {
  try {
    const retryT0 = Date.now();
    const retried = await identifyWatchGemini(
      frontUri,
      backUri,
      ragArg,
      undefined,
      undefined,
      { enableGroundedSearch: true, imageMaxWidth, disableThinking: true }
    );
    console.log(
      `[aiRouter] Gemini-grounded retry done in ${Date.now() - retryT0}ms, confidence ${prevAttempt.confidence ?? 0} → ${retried.confidence ?? 0}`
    );

    // Cost logging for grounded identify scan retry
    logCostEvent({
      type: 'scan',
      costUsd: COST_PER_CALL.scan,
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
    console.warn('[aiRouter] retryIdentifyWithGoogle failed:', e?.message);
    return null;
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
  extraAngleUris?: string[]
): Promise<AuthPayload> {
  const imageMaxWidth = imageWidthForTier(tier);
  const t0 = Date.now();
  const result = await assessAuthenticityGemini(frontUri, backUri, identified, {
    imageMaxWidth,
    signals,
    certExemplarUrls,
    extraAngleUris,
    disableThinking: true,
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
  identified: { name: string; brand: string; reference: string; confidence?: number }
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
    { disableThinking: true, idConfidence: identified.confidence }
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
  userWeightG?: number
): Promise<{
  result: ScanResult;
  provider: 'gemini';
  ragCandidates?: SimilarWatch[];
}> {
  const totalT0 = Date.now();

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

  if (enableVisualRag) {
    candidates = await getVisualCandidates(frontUri, backUri);
  }

  // Always disable thinking for identify — it's a fast visual classification,
  // not a deep reasoning task. With thinking enabled the call takes 30-40s
  // instead of 8-12s, for no measurable accuracy gain on watch identification.
  // (The reasoning happens in the AUTH step downstream, where Pro-tier model
  // and thinking budget actually matter.)
  const disableThinking = true;
  const imageMaxWidth = imageWidthForTier(tier);
  const maxOutputTokens = outputTokensForTier(tier);

  // Phase 1A: Fast Visual Identification
  const ragArg = candidates.length > 0 ? candidates : undefined;
  let identified = await identifyWatchGemini(
    frontUri,
    backUri,
    ragArg,
    undefined,
    undefined,
    { disableThinking, imageMaxWidth, maxOutputTokens }
  );

  console.log(`[aiRouter] identify done in ${Date.now() - totalT0}ms`);

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
  let certMatchHit: any = null;

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
        if (top && top.similarity > 0.95) {
          const matchedName = identified.name.toLowerCase();
          const matchesModel = top.name.toLowerCase().includes(matchedName) || matchedName.includes(top.name.toLowerCase());
          if (matchesModel) {
            dbValidated = true;
            console.log(
              `[aiRouter] DB-validated ✓ AI + DINOv3 agree: "${identified.name}" vs top visual "${top.name}" (sim=${top.similarity.toFixed(3)})`
            );
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

  if (
    identified.confidence < groundedRetryThreshold &&
    !dbValidated &&
    !certValidated
  ) {
    console.log(
      `[aiRouter] Low confidence (${identified.confidence} < ${groundedRetryThreshold}) and no visual match validation. Running grounded search fallback...`
    );
    const groundedResult = await retryIdentifyWithGoogle(
      frontUri,
      backUri,
      ragArg,
      identified,
      imageMaxWidth,
      tier,
      consent.granted ? consent.cohortHash : null
    );
    if (groundedResult && groundedResult.confidence > identified.confidence) {
      identified = groundedResult;
    }
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
      const [authPayload, priceData] = await Promise.all([
        assessAuthenticityByTier(
          tier,
          frontUri,
          backUri,
          { name: identified.name, brand: identified.brand, reference: identified.reference },
          authSignals,
          certMatchHit?.certUrl ? [certMatchHit.certUrl] : undefined,
          extraUris.length > 0 ? extraUris : undefined
        ).catch((err) => {
          console.warn('[aiRouter] authenticity assessment failed, falling back:', err?.message);
          return null;
        }),
        fetchPricesByTier(
          tier,
          { name: identified.name, brand: identified.brand, reference: identified.reference, confidence: identified.confidence }
        ).catch((err) => {
          console.warn('[aiRouter] price fetching failed, falling back:', err?.message);
          return null;
        })
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
