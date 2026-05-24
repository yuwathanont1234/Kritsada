import base64

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import get_settings
from app.db import get_conn
from app.harvester.catalog import download_image
from app.matching import get_reference
from app.schemas import DeepVerdictResponse
from app.verdict.heatmap import (
    anomaly_score,
    patch_distance_map,
    patch_features,
    render_heatmap,
)

router = APIRouter(prefix="/verdict", tags=["verdict"])


@router.post("/deep", response_model=DeepVerdictResponse)
async def deep_verdict(
    image: UploadFile = File(...),
    brand: str = Form(...),
    ref: str = Form(...),
) -> DeepVerdictResponse:
    """Fine-grained authenticity check against the stored studio reference."""
    settings = get_settings()
    user_bytes = await image.read()

    with get_conn() as conn:
        reference = get_reference(conn, brand, ref)
    if reference is None:
        raise HTTPException(status_code=404, detail="no benchmark reference for this model")

    ref_bytes, ref_ct = download_image(reference["source_url"])
    user_patches = await patch_features(user_bytes, image.content_type or "image/jpeg")
    ref_patches = await patch_features(ref_bytes, ref_ct)

    dist = patch_distance_map(user_patches, ref_patches)
    score = anomaly_score(dist)
    heatmap_png = render_heatmap(dist, user_bytes)

    if score <= settings.heatmap_authentic_threshold:
        verdict = "likely_authentic"
    elif score >= settings.heatmap_suspect_threshold:
        verdict = "suspect"
    else:
        verdict = "inconclusive"

    return DeepVerdictResponse(
        brand=brand,
        ref=ref,
        reference_source_url=reference["source_url"],
        reference_verified=reference["verified"],
        anomaly_score=round(score, 4),
        verdict=verdict,
        heatmap_png_b64=base64.b64encode(heatmap_png).decode("ascii"),
        note=(
            "Heatmap assumes both images share the same patch grid and rough "
            "alignment. Add keypoint/homography alignment for production accuracy."
        ),
    )
