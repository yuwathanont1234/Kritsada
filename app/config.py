from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str

    embed_function_url: str
    embed_function_secret: str
    expo_public_supabase_anon_key: str | None = None

    gemini_api_key: str
    gemini_model: str = "gemini-2.5-flash"

    embedding_version: str = "dinov3-vitl16/probe-v4"
    projection_weights_path: str = "app/weights/linear_probe.npz"

    match_threshold: float = 0.82
    # Strong-match thresholds for the "authentic_candidate" verdict path
    # without requiring an expert verified=true flag. A match must clear BOTH:
    #   similarity >= strong_match_similarity
    #   benchmark confidence >= strong_match_min_confidence (i.e. came from
    #     the curated official dataset, not a low-trust harvester result).
    strong_match_similarity: float = 0.90
    strong_match_min_confidence: float = 0.95
    harvest_confidence_threshold: float = 0.7
    crosscheck_min_similarity: float = 0.55

    # Fine-grained heatmap verdict thresholds on the patch anomaly score (0..1).
    heatmap_authentic_threshold: float = 0.25
    heatmap_suspect_threshold: float = 0.45

    admin_api_key: str = ""

    worker_poll_interval_seconds: float = 3.0
    max_image_bytes: int = 100 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
