from datetime import datetime, timezone
from typing import Literal, Optional
from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class DocumentMetadata(BaseModel):
    id: str = Field(default_factory=lambda: str(ObjectId()), description="24-character hex ObjectId")
    filename: str
    content_type: str
    file_size: int
    file_path: str
    page_count: int
    rendered_pages: list[int] = Field(default_factory=list)
    render_status: Literal["pending", "rendering", "completed", "failed"] = "pending"
    error_message: Optional[str] = None
    tenant_id: str = "default_tenant"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class DocumentResponse(BaseModel):
    id: str
    filename: str
    content_type: str
    file_size: int
    page_count: int
    rendered_pages: list[int]
    render_status: str
    error_message: Optional[str] = None
    tenant_id: str = "default_tenant"
    created_at: datetime
    updated_at: datetime
