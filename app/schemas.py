from typing import Literal, Optional

from pydantic import BaseModel, Field


class Identification(BaseModel):
    brand: str
    model: Optional[str] = None
    ref: str = Field(description="Manufacturer reference / model number")
    confidence: float = Field(ge=0.0, le=1.0)
    sources: list[str] = Field(default_factory=list)


class MatchResult(BaseModel):
    matched: bool
    brand: Optional[str] = None
    ref: Optional[str] = None
    similarity: Optional[float] = None
    source: Optional[str] = None
    source_url: Optional[str] = None


class ScanResponse(BaseModel):
    identification: Identification
    match: MatchResult
    # 'authentic_candidate' / 'review' come from retrieval similarity only and
    # are preliminary; a fine-grained region check is required for a final call.
    verdict: Literal["pending_harvest", "review", "authentic_candidate"]
    harvest_enqueued: bool
