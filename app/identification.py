import json

from google import genai
from google.genai import types

from app.config import get_settings
from app.schemas import Identification

_PROMPT = """You are a horology expert. Identify the watch in this image.
Use Google Search to verify the exact manufacturer reference number.
Respond with ONLY a JSON object, no markdown, of the form:
{"brand": "...", "model": "...", "ref": "...", "confidence": 0.0}
- "ref" is the official manufacturer reference / model number.
- "confidence" is your calibrated certainty (0..1) that brand+ref are correct.
If you cannot identify it, use empty strings and confidence 0."""


def _client() -> genai.Client:
    return genai.Client(api_key=get_settings().gemini_api_key)


def _extract_json(text: str) -> dict:
    text = text.strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON object in model response: {text!r}")
    return json.loads(text[start : end + 1])


def _grounding_urls(response) -> list[str]:
    urls: list[str] = []
    for cand in getattr(response, "candidates", None) or []:
        meta = getattr(cand, "grounding_metadata", None)
        for chunk in getattr(meta, "grounding_chunks", None) or []:
            web = getattr(chunk, "web", None)
            if web and getattr(web, "uri", None):
                urls.append(web.uri)
    return list(dict.fromkeys(urls))


def identify_watch(image_bytes: bytes, content_type: str = "image/jpeg") -> Identification:
    """Zero-shot brand/model/ref identification grounded with Google Search."""
    settings = get_settings()
    response = _client().models.generate_content(
        model=settings.gemini_model,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=content_type),
            _PROMPT,
        ],
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.0,
        ),
    )
    parsed = _extract_json(response.text)
    return Identification(
        brand=parsed.get("brand", "").strip(),
        model=(parsed.get("model") or "").strip() or None,
        ref=parsed.get("ref", "").strip(),
        confidence=float(parsed.get("confidence", 0.0)),
        sources=_grounding_urls(response),
    )
