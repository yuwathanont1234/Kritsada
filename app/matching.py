import numpy as np

from app.config import get_settings
from app.schemas import MatchResult


def find_best_match(conn, query_vec: np.ndarray) -> MatchResult:
    """Nearest benchmark vector in the same embedding-version space."""
    settings = get_settings()
    with conn.cursor() as cur:
        cur.execute(
            """
            select brand, ref, source, source_url,
                   1 - (embedding <=> %s) as similarity
            from image_embeddings
            where embedding_version = %s and is_benchmark = true
            order by embedding <=> %s
            limit 1
            """,
            (query_vec, settings.embedding_version, query_vec),
        )
        row = cur.fetchone()

    if row is None:
        return MatchResult(matched=False)

    brand, ref, source, source_url, similarity = row
    similarity = float(similarity)
    return MatchResult(
        matched=similarity >= settings.match_threshold,
        brand=brand,
        ref=ref,
        similarity=similarity,
        source=source,
        source_url=source_url,
    )


def benchmark_exists(conn, brand: str, ref: str) -> bool:
    settings = get_settings()
    with conn.cursor() as cur:
        cur.execute(
            """
            select 1 from image_embeddings
            where brand = %s and ref = %s
              and embedding_version = %s and is_benchmark = true
            limit 1
            """,
            (brand, ref, settings.embedding_version),
        )
        return cur.fetchone() is not None
