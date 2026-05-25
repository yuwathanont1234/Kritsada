import numpy as np

from app.schemas import Identification, MatchResult
from tests.conftest import FakeCursor, conn_factory, make_png, null_conn


def _patch_scan(monkeypatch, *, match: MatchResult, exists: bool, enqueued: bool):
    import app.main as main

    async def fake_embed(*_a, **_k):
        return np.ones(256, dtype="float32")

    monkeypatch.setattr(main, "identify_watch", lambda *a, **k: Identification(
        brand="Rolex", model="Submariner", ref="124060", confidence=0.9, sources=[]
    ))
    monkeypatch.setattr(main, "embed_image", fake_embed)
    monkeypatch.setattr(main, "get_conn", null_conn)
    monkeypatch.setattr(main, "find_best_match", lambda *a, **k: match)
    monkeypatch.setattr(main, "benchmark_exists", lambda *a, **k: exists)
    monkeypatch.setattr(main, "enqueue_harvest", lambda *a, **k: enqueued)


def test_scan_unseen_model_enqueues_harvest(client, monkeypatch):
    _patch_scan(monkeypatch, match=MatchResult(matched=False), exists=False, enqueued=True)
    resp = client.post("/scan", files={"image": ("w.jpg", make_png(), "image/jpeg")})
    assert resp.status_code == 200
    body = resp.json()
    assert body["identification"]["ref"] == "124060"
    assert body["harvest_enqueued"] is True
    assert body["verdict"] == "pending_harvest"


def test_scan_verified_match_is_authentic_candidate(client, monkeypatch):
    match = MatchResult(matched=True, brand="Rolex", ref="124060", similarity=0.9,
                        source="harvester", verified=True)
    _patch_scan(monkeypatch, match=match, exists=True, enqueued=False)
    resp = client.post("/scan", files={"image": ("w.jpg", make_png(), "image/jpeg")})
    assert resp.json()["verdict"] == "authentic_candidate"


def test_scan_unverified_match_is_review(client, monkeypatch):
    match = MatchResult(matched=True, brand="Rolex", ref="124060", similarity=0.9,
                        source="harvester", verified=False)
    _patch_scan(monkeypatch, match=match, exists=True, enqueued=False)
    assert client.post(
        "/scan", files={"image": ("w.jpg", make_png(), "image/jpeg")}
    ).json()["verdict"] == "review"


def test_admin_verify_requires_key(client):
    assert client.post("/admin/benchmarks/x/verify", json={"verified_by": "a"}).status_code == 401


def test_admin_verify_success(client, monkeypatch):
    import app.admin as admin
    monkeypatch.setattr(admin, "get_conn", conn_factory(FakeCursor(one=("id-1",))))
    resp = client.post(
        "/admin/benchmarks/id-1/verify",
        json={"verified_by": "alice"},
        headers={"X-Admin-Key": "test-admin-key"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"id": "id-1", "verified": True}


def test_admin_verify_missing_returns_404(client, monkeypatch):
    import app.admin as admin
    monkeypatch.setattr(admin, "get_conn", conn_factory(FakeCursor(one=None)))
    resp = client.post(
        "/admin/benchmarks/nope/verify",
        json={"verified_by": "alice"},
        headers={"X-Admin-Key": "test-admin-key"},
    )
    assert resp.status_code == 404


def test_verdict_deep_authentic_when_identical(client, monkeypatch):
    import app.verdict.routes as routes

    grid = np.ones((8, 8, 16), dtype="float32")
    calls = iter([grid, grid])

    async def fake_patches(*_a, **_k):
        return next(calls)

    monkeypatch.setattr(routes, "get_conn", null_conn)
    monkeypatch.setattr(routes, "get_reference",
                        lambda *a, **k: {"source_url": "http://x/i.png", "verified": True})
    monkeypatch.setattr(routes, "download_image", lambda url: (make_png(), "image/png"))
    monkeypatch.setattr(routes, "align_to_reference", lambda u, r: (make_png(), True))
    monkeypatch.setattr(routes, "patch_features", fake_patches)

    resp = client.post(
        "/verdict/deep",
        data={"brand": "Rolex", "ref": "124060"},
        files={"image": ("w.jpg", make_png(), "image/jpeg")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["aligned"] is True
    assert body["verdict"] == "likely_authentic"
    assert body["anomaly_score"] <= 0.25
    assert len(body["heatmap_png_b64"]) > 0


def test_verdict_deep_suspect_when_divergent(client, monkeypatch):
    import app.verdict.routes as routes

    user = np.ones((8, 8, 16), dtype="float32")
    ref = -np.ones((8, 8, 16), dtype="float32")  # opposite -> max distance
    calls = iter([user, ref])

    async def fake_patches(*_a, **_k):
        return next(calls)

    monkeypatch.setattr(routes, "get_conn", null_conn)
    monkeypatch.setattr(routes, "get_reference",
                        lambda *a, **k: {"source_url": "http://x/i.png", "verified": False})
    monkeypatch.setattr(routes, "download_image", lambda url: (make_png(), "image/png"))
    monkeypatch.setattr(routes, "align_to_reference", lambda u, r: (make_png(), True))
    monkeypatch.setattr(routes, "patch_features", fake_patches)

    body = client.post(
        "/verdict/deep",
        data={"brand": "Rolex", "ref": "124060"},
        files={"image": ("w.jpg", make_png(), "image/jpeg")},
    ).json()
    assert body["verdict"] == "suspect"
    assert body["anomaly_score"] >= 0.45


def test_verdict_deep_inconclusive_when_not_aligned(client, monkeypatch):
    import app.verdict.routes as routes

    grid = np.ones((8, 8, 16), dtype="float32")  # identical -> would be authentic
    calls = iter([grid, grid])

    async def fake_patches(*_a, **_k):
        return next(calls)

    monkeypatch.setattr(routes, "get_conn", null_conn)
    monkeypatch.setattr(routes, "get_reference",
                        lambda *a, **k: {"source_url": "http://x/i.png", "verified": True})
    monkeypatch.setattr(routes, "download_image", lambda url: (make_png(), "image/png"))
    monkeypatch.setattr(routes, "align_to_reference", lambda u, r: (make_png(), False))
    monkeypatch.setattr(routes, "patch_features", fake_patches)

    body = client.post(
        "/verdict/deep",
        data={"brand": "Rolex", "ref": "124060"},
        files={"image": ("w.jpg", make_png(), "image/jpeg")},
    ).json()
    # Quality gate overrides the otherwise-authentic score.
    assert body["aligned"] is False
    assert body["verdict"] == "inconclusive"


def test_verdict_deep_404_without_reference(client, monkeypatch):
    import app.verdict.routes as routes
    monkeypatch.setattr(routes, "get_conn", null_conn)
    monkeypatch.setattr(routes, "get_reference", lambda *a, **k: None)
    resp = client.post(
        "/verdict/deep",
        data={"brand": "X", "ref": "Y"},
        files={"image": ("w.jpg", make_png(), "image/jpeg")},
    )
    assert resp.status_code == 404
