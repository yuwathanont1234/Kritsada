from fastapi import APIRouter, Depends, Header, HTTPException

from app.config import get_settings
from app.db import get_conn
from app.schemas import BenchmarkRow, VerifyRequest

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(x_admin_key: str = Header(default="")) -> None:
    expected = get_settings().admin_api_key
    if not expected or x_admin_key != expected:
        raise HTTPException(status_code=401, detail="invalid admin key")


@router.get("/benchmarks", response_model=list[BenchmarkRow])
def list_benchmarks(
    verified: bool | None = None,
    limit: int = 50,
    _: None = Depends(require_admin),
) -> list[BenchmarkRow]:
    clauses, params = ["is_benchmark = true"], []
    if verified is not None:
        clauses.append("verified = %s")
        params.append(verified)
    params.append(min(limit, 200))
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            select id, brand, ref, model, source, source_url,
                   confidence, verified, created_at
            from image_embeddings
            where {' and '.join(clauses)}
            order by created_at desc
            limit %s
            """,
            params,
        )
        rows = cur.fetchall()
    return [
        BenchmarkRow(
            id=str(r[0]), brand=r[1], ref=r[2], model=r[3], source=r[4],
            source_url=r[5], confidence=r[6], verified=r[7],
            created_at=r[8].isoformat(),
        )
        for r in rows
    ]


@router.post("/benchmarks/{benchmark_id}/verify")
def verify_benchmark(
    benchmark_id: str,
    body: VerifyRequest,
    _: None = Depends(require_admin),
) -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "update image_embeddings set verified = true, verified_at = now(), "
                "verified_by = %s where id = %s returning id",
                (body.verified_by, benchmark_id),
            )
            found = cur.fetchone() is not None
        conn.commit()
    if not found:
        raise HTTPException(status_code=404, detail="benchmark not found")
    return {"id": benchmark_id, "verified": True}


@router.delete("/benchmarks/{benchmark_id}")
def reject_benchmark(benchmark_id: str, _: None = Depends(require_admin)) -> dict:
    """Remove a bad harvest so it can never seed a future match."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "delete from image_embeddings where id = %s returning id",
                (benchmark_id,),
            )
            found = cur.fetchone() is not None
        conn.commit()
    if not found:
        raise HTTPException(status_code=404, detail="benchmark not found")
    return {"id": benchmark_id, "deleted": True}
