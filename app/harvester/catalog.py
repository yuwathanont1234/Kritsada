import json

import httpx
from google import genai
from google.genai import types

from app.config import get_settings

# Prism Catalog Resolution: find official, high-resolution studio image URLs
# for a given brand/model/ref using grounded search.

_PROMPT = """Find official, high-resolution studio product photos for this watch:
brand="{brand}", model="{model}", ref="{ref}".
Prefer the manufacturer's own site or authorized retailers. Front-facing,
clean-background catalog shots only (no user photos, no marketplace listings).
Respond with ONLY a JSON array of direct image URLs, e.g. ["https://...jpg"].
Return [] if you cannot find official imagery."""


def resolve_studio_images(brand: str, model: str | None, ref: str) -> list[str]:
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=_PROMPT.format(brand=brand, model=model or "", ref=ref),
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.0,
        ),
    )
    text = response.text.strip()
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        return []
    try:
        urls = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return []
    return [u for u in urls if isinstance(u, str) and u.startswith("http")]


def download_image(url: str) -> tuple[bytes, str]:
    settings = get_settings()
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        with client.stream("GET", url) as resp:
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "image/jpeg").split(";")[0]
            if not content_type.startswith("image/"):
                raise ValueError(f"URL is not an image ({content_type}): {url}")
            chunks, total = [], 0
            for chunk in resp.iter_bytes():
                total += len(chunk)
                if total > settings.max_image_bytes:
                    raise ValueError(f"Image exceeds {settings.max_image_bytes} bytes")
                chunks.append(chunk)
    return b"".join(chunks), content_type
