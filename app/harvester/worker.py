import asyncio
import logging

import numpy as np

from app.config import get_settings
from app.db import get_conn
from app.embedding import cosine_similarity, embed_image
from app.harvester.catalog import download_image, resolve_studio_images
from app.harvester.queue import claim_job, finish_job, reschedule_or_fail
from app.harvester.upsert import upsert_benchmark

log = logging.getLogger("harvester")


async def _process(job: dict) -> None:
    settings = get_settings()
    brand, ref, model = job["brand"], job["ref"], job["model"]

    # Confidence gate: never let a low-certainty identification seed the DB.
    if (job["confidence"] or 0.0) < settings.harvest_confidence_threshold:
        with get_conn() as conn:
            finish_job(conn, job["id"], "failed", "below confidence threshold")
        log.info("skip %s/%s: low confidence", brand, ref)
        return

    urls = resolve_studio_images(brand, model, ref)
    if not urls:
        raise RuntimeError("no official studio images resolved")

    trigger = job.get("trigger_embedding")
    trigger_vec = np.asarray(trigger, dtype=np.float32) if trigger is not None else None

    stored = 0
    last_reason = "no candidate passed cross-check"
    for url in urls:
        try:
            image_bytes, content_type = download_image(url)
            vec = await embed_image(image_bytes, content_type)
        except Exception as exc:  # noqa: BLE001 - per-candidate, keep going
            last_reason = f"fetch/embed failed: {exc}"
            log.warning("candidate %s failed: %s", url, exc)
            continue

        # Cross-check: the official image must resemble the user's actual scan.
        # Guards against a wrong ref poisoning this model's benchmark.
        if trigger_vec is not None:
            sim = cosine_similarity(vec, trigger_vec)
            if sim < settings.crosscheck_min_similarity:
                last_reason = f"cross-check {sim:.3f} < {settings.crosscheck_min_similarity}"
                log.info("reject %s: %s", url, last_reason)
                continue

        with get_conn() as conn:
            if upsert_benchmark(conn, brand, ref, model, vec, url, job["confidence"]):
                stored += 1

    if stored == 0:
        raise RuntimeError(last_reason)

    with get_conn() as conn:
        finish_job(conn, job["id"], "done")
    log.info("harvested %d benchmark(s) for %s/%s", stored, brand, ref)


async def run_forever() -> None:
    settings = get_settings()
    log.info("harvester worker started (poll=%ss)", settings.worker_poll_interval_seconds)
    while True:
        with get_conn() as conn:
            job = claim_job(conn)
        if job is None:
            await asyncio.sleep(settings.worker_poll_interval_seconds)
            continue
        try:
            await _process(job)
        except Exception as exc:  # noqa: BLE001 - reschedule with backoff
            log.exception("job %s failed", job["id"])
            with get_conn() as conn:
                reschedule_or_fail(conn, job, str(exc))
