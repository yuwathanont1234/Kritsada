import logging

from fastapi import FastAPI, File, UploadFile

from app.config import get_settings
from app.db import get_conn
from app.embedding import embed_image
from app.harvester.queue import enqueue_harvest
from app.identification import identify_watch
from app.matching import benchmark_exists, find_best_match
from app.schemas import ScanResponse

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Self-Learning Watch Scan RAG")


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

    if not match.matched:
        verdict = "pending_harvest" if harvest_enqueued else "review"
    else:
        verdict = "authentic_candidate"

    return ScanResponse(
        identification=identification,
        match=match,
        verdict=verdict,
        harvest_enqueued=harvest_enqueued,
    )
