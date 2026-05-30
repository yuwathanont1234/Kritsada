import numpy as np

from app.config import get_settings


def upsert_benchmark(
    conn,
    brand: str,
    ref: str,
    model: str | None,
    embedding: np.ndarray,
    source_url: str,
    confidence: float,
) -> bool:
    """Idempotent insert of a harvested benchmark vector.

    Keyed on (brand, ref, source_url, embedding_version) so re-running a job,
    or two workers racing the same studio image, never creates duplicates.
    Returns True if a new row was written.
    """
    settings = get_settings()
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into watch_models (brand, ref, model)
            values (%s, %s, %s)
            on conflict (brand, ref) do update
                set model = coalesce(excluded.model, watch_models.model)
            """,
            (brand, ref, model),
        )
        cur.execute(
            """
            insert into watch_embeddings
                (brand, ref, model, embedding, embedding_version,
                 source, source_url, confidence, is_benchmark, harvested_at)
            values (%s, %s, %s, %s, %s, 'harvester', %s, %s, true, now())
            on conflict (brand, ref, source_url, embedding_version) do nothing
            returning id
            """,
            (
                brand, ref, model, embedding, settings.embedding_version,
                source_url, confidence,
            ),
        )
        inserted = cur.fetchone() is not None
    conn.commit()
    return inserted
