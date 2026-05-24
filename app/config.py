from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str

    embed_function_url: str
    embed_function_secret: str

    gemini_api_key: str
    gemini_model: str = "gemini-2.5-flash"

    embedding_version: str = "dinov3-vitl16/probe-v1"
    projection_weights_path: str = "app/weights/linear_probe.npz"

    match_threshold: float = 0.82
    harvest_confidence_threshold: float = 0.7
    crosscheck_min_similarity: float = 0.55

    worker_poll_interval_seconds: float = 3.0
    max_image_bytes: int = 100 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
