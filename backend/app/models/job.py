from datetime import datetime, timezone
from typing import Any, Literal, Optional
from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ExtractStartRequest(BaseModel):
    document_id: str
    schema_id: Optional[str] = None
    json_schema: Optional[dict[str, Any]] = None
    page_range: Optional[str] = None


class ExtractionJob(BaseModel):
    id: str = Field(default_factory=lambda: str(ObjectId()), description="24-character hex ObjectId")
    document_id: str
    filename: str = ""
    schema_id: Optional[str] = None
    json_schema: dict[str, Any] = Field(default_factory=dict)
    page_range: Optional[str] = None
    requested_pages: list[int] = Field(default_factory=list)
    status: Literal[
        "pending",
        "waiting_for_render",
        "extracting",
        "merging",
        "completed",
        "partial_success",
        "failed",
        "harmonizing",
        "harmonize_failed",
    ] = "pending"
    progress_percent: int = 0
    raw_extraction: Optional[dict[str, Any]] = None
    token_usage: TokenUsage = Field(default_factory=TokenUsage)
    error_message: Optional[str] = None
    failed_pages: list[int] = Field(default_factory=list)
    harmonized: bool = False
    harmonized_target_collection: Optional[str] = None
    tenant_id: str = "default_tenant"
    commit_in_progress: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True)


class ExtractionJobResponse(BaseModel):
    id: str
    document_id: str
    filename: str
    schema_id: Optional[str] = None
    json_schema: dict[str, Any]
    page_range: Optional[str] = None
    requested_pages: list[int]
    status: str
    progress_percent: int
    raw_extraction: Optional[dict[str, Any]] = None
    token_usage: TokenUsage
    error_message: Optional[str] = None
    failed_pages: list[int] = Field(default_factory=list)
    harmonized: bool = False
    harmonized_target_collection: Optional[str] = None
    tenant_id: str = "default_tenant"
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
