import io

import cv2
import numpy as np
from PIL import Image

# Geometric alignment before patch comparison.
#
# A phone scan and an official studio shot differ in perspective, scale, and
# centering, so a position-for-position patch comparison is only valid once the
# user image has been warped into the reference's frame. We estimate a
# homography from ORB feature matches (RANSAC-filtered) and warp accordingly.
# If too few reliable matches are found we return the original image unchanged
# and report aligned=False so the caller can flag a lower-confidence verdict.

_MIN_INLIERS = 12
_RANSAC_REPROJ_THRESHOLD = 5.0


def _to_cv(image_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)


def _to_png(cv_img: np.ndarray) -> bytes:
    rgb = cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)
    buf = io.BytesIO()
    Image.fromarray(rgb).save(buf, format="PNG")
    return buf.getvalue()


def align_to_reference(user_bytes: bytes, ref_bytes: bytes) -> tuple[bytes, bool]:
    """Warp the user image onto the reference frame. Returns (png_bytes, aligned)."""
    user = _to_cv(user_bytes)
    ref = _to_cv(ref_bytes)
    ref_h, ref_w = ref.shape[:2]

    orb = cv2.ORB_create(nfeatures=2000)
    kp_u, des_u = orb.detectAndCompute(cv2.cvtColor(user, cv2.COLOR_BGR2GRAY), None)
    kp_r, des_r = orb.detectAndCompute(cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY), None)
    if des_u is None or des_r is None or len(kp_u) < _MIN_INLIERS or len(kp_r) < _MIN_INLIERS:
        return user_bytes, False

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = matcher.match(des_u, des_r)
    if len(matches) < _MIN_INLIERS:
        return user_bytes, False

    matches = sorted(matches, key=lambda m: m.distance)
    src = np.float32([kp_u[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    dst = np.float32([kp_r[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)

    homography, mask = cv2.findHomography(
        src, dst, cv2.RANSAC, _RANSAC_REPROJ_THRESHOLD
    )
    if homography is None or mask is None or int(mask.sum()) < _MIN_INLIERS:
        return user_bytes, False

    warped = cv2.warpPerspective(user, homography, (ref_w, ref_h))
    return _to_png(warped), True
