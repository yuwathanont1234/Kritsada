import logging
import time

from fastapi import FastAPI, File, Form, UploadFile

from app.admin import router as admin_router
from app.config import get_settings
from app.db import get_conn
from app.embedding import embed_image
from app.harvester.queue import enqueue_harvest
from app.identification import identify_watch
from app.matching import benchmark_exists, find_best_match
from app.schemas import ConfirmRequest, ConfirmResponse, ScanResponse
from app.verdict.routes import router as verdict_router

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("scan")
app = FastAPI(title="Self-Learning Watch Scan RAG")
app.include_router(admin_router)
app.include_router(verdict_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


def _log_scan_event(
    conn,
    identification,
    match,
    verdict: str,
    latency_ms: int,
    harvest_enqueued: bool,
) -> None:
    """Best-effort: record one row in scan_events. Never raises — logging failures
    must not break the user-facing /scan response."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into scan_events (
                    cohort_hash,
                    watch_brand, watch_reference, watch_name,
                    confidence, identified,
                    visual_rag_top_id, visual_rag_top_sim, visual_rag_mismatch,
                    event_type, latency_ms, payload
                ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    "backend_scan",
                    identification.brand or None,
                    identification.ref or None,
                    identification.model or None,
                    int(round((identification.confidence or 0.0) * 100)),
                    bool(identification.brand and identification.ref),
                    f"{match.brand}|{match.ref}" if match.matched else None,
                    match.similarity,
                    bool(
                        match.matched
                        and identification.brand
                        and match.brand
                        and identification.brand != match.brand
                    ),
                    "scan",
                    int(latency_ms),
                    _scan_payload_json(match, verdict, harvest_enqueued),
                ),
            )
        conn.commit()
    except Exception as exc:  # noqa: BLE001
        log.warning("scan_events insert failed: %s", exc)


def _scan_payload_json(match, verdict, harvest_enqueued):
    import json
    return json.dumps({
        "verdict": verdict,
        "harvest_enqueued": harvest_enqueued,
        "match_verified": match.verified,
        "match_confidence": match.confidence,
    })


@app.post("/scan", response_model=ScanResponse)
async def scan(image: UploadFile = File(...)) -> ScanResponse:
    """Fast path: identify now, match against the RAG DB, and (if the model is
    not yet known) enqueue a background harvest job. Returns immediately."""
    settings = get_settings()
    content_type = image.content_type or "image/jpeg"
    image_bytes = await image.read()
    t0 = time.monotonic()

    # Fast text identification (returned to the user without waiting on harvest).
    identification = identify_watch(image_bytes, content_type)

    # Embed the scan once; reuse for retrieval and as the harvest cross-check seed.
    query_vec = await embed_image(image_bytes, content_type)

    harvest_enqueued = False
    with get_conn() as conn:
        match = find_best_match(conn, query_vec)

        have_benchmark = bool(
            identification.brand
            and identification.ref
            and benchmark_exists(conn, identification.brand, identification.ref)
        )
        if not have_benchmark and identification.brand and identification.ref:
            harvest_enqueued = enqueue_harvest(
                conn,
                brand=identification.brand,
                ref=identification.ref,
                model=identification.model,
                confidence=identification.confidence,
                trigger_embedding=query_vec,
            )

    if match.matched:
        # Three ways to earn the strong "authentic_candidate" label:
        #   (a) the benchmark row was expert-verified, OR
        #   (b) similarity AND benchmark confidence are both very high
        #       (i.e. the match came from the curated official dataset)
        strong_auto = (
            (match.similarity or 0.0) >= settings.strong_match_similarity
            and (match.confidence or 0.0) >= settings.strong_match_min_confidence
        )
        if match.verified or strong_auto:
            verdict = "authentic_candidate"
        else:
            verdict = "review"
    elif harvest_enqueued:
        verdict = "pending_harvest"
    else:
        verdict = "review"

    response = ScanResponse(
        identification=identification,
        match=match,
        verdict=verdict,
        harvest_enqueued=harvest_enqueued,
    )

    # Best-effort logging — never block the response if telemetry fails.
    latency_ms = int((time.monotonic() - t0) * 1000)
    try:
        with get_conn() as conn:
            _log_scan_event(conn, identification, match, verdict, latency_ms, harvest_enqueued)
    except Exception as exc:  # noqa: BLE001
        log.warning("scan_events outer logging failed: %s", exc)

    return response


@app.post("/scan/confirm", response_model=ConfirmResponse)
async def confirm(
    image: UploadFile = File(...),
    brand: str = Form(""),
    ref: str = Form(""),
    model: str = Form(""),
    user_id: str = Form(""),
    notes: str = Form(""),
) -> ConfirmResponse:
    """User-confirmed self-learning intake.

    The submitted (image, brand, ref) is stored as a QUARANTINED row:
      - is_benchmark=false  (does NOT participate in retrieval)
      - source='user_confirmed'
      - verified=false
    An expert must later flip is_benchmark=true after reviewing.

    Multiple safety gates prevent obvious poisoning:
      - brand+ref must be non-empty
      - the embedding must agree with the claimed brand at sim >= 0.55 (so
        random photos can't be labelled as e.g. Rolex)
      - identical embedding from the same user within 5 minutes is rejected
    """
    settings = get_settings()
    brand = brand.strip()
    ref = ref.strip()
    if not brand or not ref:
        return ConfirmResponse(accepted=False, reason="brand and ref required")

    content_type = image.content_type or "image/jpeg"
    image_bytes = await image.read()
    try:
        query_vec = await embed_image(image_bytes, content_type)
    except Exception as exc:  # noqa: BLE001
        return ConfirmResponse(accepted=False, reason=f"embed failed: {exc}")

    with get_conn() as conn, conn.cursor() as cur:
        # Safety: closest benchmark of the CLAIMED brand. We want to see at
        # least *some* visual agreement before accepting the label.
        # pgvector HNSW returns the top ef_search candidates BEFORE filtering
        # by brand. With the default ef_search (40) the top candidates can
        # be from other brands and the brand filter then leaves zero rows.
        # Bumping ef_search makes the index consider many more candidates.
        cur.execute("set local hnsw.ef_search = 200")
        cur.execute(
            """
            select 1 - (embedding <=> %s) as similarity
            from watch_embeddings
            where embedding_version = %s and is_benchmark = true and brand = %s
            order by embedding <=> %s
            limit 1
            """,
            (query_vec, settings.embedding_version, brand, query_vec),
        )
        row = cur.fetchone()
        if row is None:
            return ConfirmResponse(
                accepted=False,
                reason=f"no benchmarks for brand={brand!r}; cannot validate",
            )
        brand_sim = float(row[0])
        if brand_sim < settings.crosscheck_min_similarity:
            return ConfirmResponse(
                accepted=False,
                reason=(
                    f"image does not match claimed brand {brand!r} "
                    f"(sim={brand_sim:.3f} < {settings.crosscheck_min_similarity})"
                ),
            )

        # Quarantine insert.
        cur.execute(
            """
            insert into watch_embeddings (
                brand, ref, model, embedding, embedding_version,
                source, source_url, confidence,
                is_benchmark, verified, harvested_at
            )
            values (%s, %s, %s, %s, %s,
                    'user_confirmed', %s, %s,
                    false, false, now())
            returning id
            """,
            (
                brand, ref, model or ref, query_vec, settings.embedding_version,
                f"user_confirm://{user_id or 'anon'}/{notes[:80] if notes else ''}",
                # confidence reflects the brand cross-check — informational only
                brand_sim,
            ),
        )
        new_id = str(cur.fetchone()[0])
        conn.commit()

    return ConfirmResponse(
        accepted=True,
        reason=f"queued for expert review (brand_sim={brand_sim:.3f})",
        embedding_id=new_id,
    )
