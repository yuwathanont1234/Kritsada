import io

import numpy as np
import pytest
from PIL import Image

from app.verdict.heatmap import (
    anomaly_score,
    patch_distance_map,
    render_heatmap,
)
from tests.conftest import make_png


def test_distance_zero_for_identical_patches():
    g = np.ones((4, 4, 8), dtype="float32")
    assert np.allclose(patch_distance_map(g, g), 0.0, atol=1e-6)


def test_distance_one_for_opposite_patches():
    g = np.ones((4, 4, 8), dtype="float32")
    assert np.allclose(patch_distance_map(g, -g), 1.0, atol=1e-6)


def test_grid_mismatch_raises():
    with pytest.raises(ValueError):
        patch_distance_map(np.ones((4, 4, 8)), np.ones((3, 3, 8)))


def test_anomaly_score_focuses_on_worst_region():
    dist = np.zeros((10, 10), dtype="float32")
    dist[:2, :] = 1.0  # 20% of patches are maximally divergent
    assert anomaly_score(dist, top_fraction=0.2) == pytest.approx(1.0, abs=1e-6)


def test_render_heatmap_returns_valid_png():
    dist = np.random.default_rng(0).random((8, 8)).astype("float32")
    png = render_heatmap(dist, make_png(size=(80, 60)))
    img = Image.open(io.BytesIO(png))
    assert img.format == "PNG"
    assert img.size == (80, 60)
