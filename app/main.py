import logging

from fastapi import FastAPI, File, UploadFile

from app.admin import router as admin_router
from app.config import get_settings
from app.db import get_conn
from app.embedding import embed_image
from app.harvester.queue import enqueue_harvest
from app.identification import identify_watch
from app.matching import benchmark_exists, find_best_match
from app.schemas import ScanResponse
from app.verdict.routes import router as verdict_router

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Self-Learning Watch Scan RAG")
app.include_router(admin_router)
app.include_router(verdict_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/scan", response_model=ScanResponse)
async def scan(image: UploadFile = File(...)) -> ScanResponse:
    """Fast path: identify now, match against the RAG DB, and (if the model is
    not yet known) enqueue a background harvest job. Returns immediately."""
    settings = get_settings()
    content_type = image.content_type or "image/jpeg"
    image_bytes = await image.read()

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
        # Trust an auto-harvested benchmark less than an expert-verified one.
        verdict = "authentic_candidate" if match.verified else "review"
    elif harvest_enqueued:
        verdict = "pending_harvest"
    else:
        verdict = "review"

    return ScanResponse(
        identification=identification,
        match=match,
        verdict=verdict,
        harvest_enqueued=harvest_enqueued,
    )
