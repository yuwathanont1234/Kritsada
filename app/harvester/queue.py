import numpy as np


def enqueue_harvest(
    conn,
    brand: str,
    ref: str,
    model: str | None,
    confidence: float,
    trigger_embedding: np.ndarray | None,
    trigger_image_url: str | None = None,
) -> bool:
    """Enqueue a harvest job unless one is already active for this model.

    Returns True if a new job row was inserted. The partial unique index
    `harvest_jobs_active_uniq` is the safety net under concurrency; the
    NOT EXISTS guard avoids raising on the common path.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into harvest_jobs
                (brand, ref, model, confidence, trigger_embedding, trigger_image_url)
            select %s, %s, %s, %s, %s, %s
            where not exists (
                select 1 from harvest_jobs
                where brand = %s and ref = %s and status in ('pending','running')
            )
            on conflict do nothing
            returning id
            """,
            (
                brand, ref, model, confidence, trigger_embedding, trigger_image_url,
                brand, ref,
            ),
        )
        inserted = cur.fetchone() is not None
    conn.commit()
    return inserted


def claim_job(conn):
    with conn.cursor() as cur:
        cur.execute("select * from claim_harvest_job()")
        row = cur.fetchone()
        colnames = [d.name for d in cur.description]
    conn.commit()
    if row is None or row[0] is None:
        return None
    return dict(zip(colnames, row))


def finish_job(conn, job_id, status: str, error: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "update harvest_jobs set status=%s, last_error=%s, updated_at=now() "
            "where id=%s",
            (status, error, job_id),
        )
    conn.commit()


def reschedule_or_fail(conn, job: dict, error: str) -> None:
    """Back off and retry, or mark failed once attempts are exhausted."""
    with conn.cursor() as cur:
        if job["attempts"] >= job["max_attempts"]:
            cur.execute(
                "update harvest_jobs set status='failed', last_error=%s, "
                "updated_at=now() where id=%s",
                (error, job["id"]),
            )
        else:
            backoff = 2 ** job["attempts"]
            cur.execute(
                "update harvest_jobs set status='pending', last_error=%s, "
                "run_after = now() + (%s || ' seconds')::interval, updated_at=now() "
                "where id=%s",
                (error, str(backoff), job["id"]),
            )
    conn.commit()
