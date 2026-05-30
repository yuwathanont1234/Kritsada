import io

import cv2
import numpy as np
from PIL import Image, ImageDraw

from app.verdict.align import align_to_reference


def _textured_png(size=256) -> bytes:
    img = Image.new("RGB", (size, size), (30, 30, 30))
    draw = ImageDraw.Draw(img)
    rng = np.random.default_rng(7)
    for _ in range(80):
        x0, y0 = rng.integers(0, size, 2)
        x1, y1 = x0 + rng.integers(8, 40), y0 + rng.integers(8, 40)
        color = tuple(int(c) for c in rng.integers(60, 255, 3))
        if rng.random() < 0.5:
            draw.rectangle([x0, y0, x1, y1], fill=color)
        else:
            draw.ellipse([x0, y0, x1, y1], fill=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _to_arr(png: bytes) -> np.ndarray:
    return np.asarray(Image.open(io.BytesIO(png)).convert("RGB"), dtype="float32")


def test_alignment_recovers_known_warp():
    ref_png = _textured_png()
    ref = cv2.cvtColor(_to_arr(ref_png).astype("uint8"), cv2.COLOR_RGB2BGR)
    h, w = ref.shape[:2]

    # Known perspective transform applied to produce the "user" scan.
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[18, 12], [w - 30, 6], [w - 10, h - 24], [22, h - 8]])
    warp = cv2.getPerspectiveTransform(src, dst)
    user = cv2.warpPerspective(ref, warp, (w, h))
    user_png = io.BytesIO()
    Image.fromarray(cv2.cvtColor(user, cv2.COLOR_BGR2RGB)).save(user_png, format="PNG")

    aligned_png, aligned = align_to_reference(user_png.getvalue(), ref_png)
    assert aligned is True

    ref_arr = _to_arr(ref_png)
    before = np.abs(_to_arr(user_png.getvalue()) - ref_arr).mean()
    after = np.abs(_to_arr(aligned_png) - ref_arr).mean()
    assert after < before  # alignment moved the scan closer to the reference


def test_alignment_gives_up_on_featureless_image():
    blank = io.BytesIO()
    Image.new("RGB", (128, 128), (10, 10, 10)).save(blank, format="PNG")
    out, aligned = align_to_reference(blank.getvalue(), blank.getvalue())
    assert aligned is False
    assert out == blank.getvalue()
