import numpy as np

from app.config import get_settings
from app.schemas import MatchResult


def find_best_match(conn, query_vec: np.ndarray) -> MatchResult:
    """Nearest benchmark vector in the same embedding-version space."""
    settings = get_settings()
    with conn.cursor() as cur:
        cur.execute(
            """
            select brand, ref, source, source_url, verified, confidence,
                   1 - (embedding <=> %s) as similarity
            from watch_embeddings
            where embedding_version = %s and is_benchmark = true
            order by embedding <=> %s
            limit 1
            """,
            (query_vec, settings.embedding_version, query_vec),
        )
        row = cur.fetchone()

    if row is None:
        return MatchResult(matched=False)

    brand, ref, source, source_url, verified, confidence, similarity = row
    similarity = float(similarity)
    return MatchResult(
        matched=similarity >= settings.match_threshold,
        brand=brand,
        ref=ref,
        similarity=similarity,
        source=source,
        source_url=source_url,
        verified=verified,
        confidence=float(confidence) if confidence is not None else None,
    )


def get_reference(conn, brand: str, ref: str) -> dict | None:
    """Best studio reference for a model, preferring expert-verified rows."""
    settings = get_settings()
    with conn.cursor() as cur:
        cur.execute(
            """
            select source_url, verified from watch_embeddings
            where brand = %s and ref = %s and embedding_version = %s
              and is_benchmark = true and source_url is not null
            order by verified desc, created_at desc
            limit 1
            """,
            (brand, ref, settings.embedding_version),
        )
        row = cur.fetchone()
    if row is None:
        return None
    return {"source_url": row[0], "verified": row[1]}


def benchmark_exists(conn, brand: str, ref: str) -> bool:
    settings = get_settings()
    with conn.cursor() as cur:
        cur.execute(
            """
            select 1 from watch_embeddings
            where brand = %s and ref = %s
              and embedding_version = %s and is_benchmark = true
            limit 1
            """,
            (brand, ref, settings.embedding_version),
        )
        return cur.fetchone() is not None
