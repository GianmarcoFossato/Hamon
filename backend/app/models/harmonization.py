from datetime import datetime, timezone
from typing import Any, Literal, Optional
from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field

TransformType = Literal[
    "direct",
    "trim",
    "string",
    "int",
    "float",
    "clean_currency",
    "iso_date",
    "boolean",
    "object_id",
    "constant",
    "formula",
]


class FieldMappingItem(BaseModel):
    source_path: str
    target_field: str
    transform: TransformType = "direct"
    transform_args: Optional[dict[str, Any]] = None
    confidence: Optional[float] = None
    sample_value: Optional[Any] = None


class HarmonizationProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(ObjectId()), description="24-character hex ObjectId")
    name: str
    source_schema_id: Optional[str] = None
    target_collection: str
    field_mappings: list[FieldMappingItem] = Field(default_factory=list)
    tenant_id: str = "default_tenant"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class HarmonizationProfileResponse(BaseModel):
    id: str
    name: str
    source_schema_id: Optional[str] = None
    target_collection: str
    field_mappings: list[FieldMappingItem]
    tenant_id: str = "default_tenant"
    created_at: datetime
    updated_at: datetime


class SchemaMatchRequest(BaseModel):
    target_collection: str
    source_fields: list[str]
    source_samples: Optional[dict[str, list[Any]]] = None
    job_id: Optional[str] = None
    method: str = "llm"


class SchemaMatchCandidate(BaseModel):
    source_attribute: str
    target_attribute: str
    similarity: float
    suggested_transform: str = "direct"


class ValueMatchRequest(BaseModel):
    target_collection: str
    source_col: str
    target_col: str
    source_values: list[Any] = Field(default_factory=list)


class PreviewRequest(BaseModel):
    target_collection: str
    field_mappings: list[FieldMappingItem]
    job_id: Optional[str] = None
    raw_data: Optional[Any] = None
    root_array_path: Optional[str] = None


class PreviewResponse(BaseModel):
    sample_raw: Any = None
    sample_harmonized: Any = None
    preview_rows: list[dict[str, Any]] = Field(default_factory=list)
    diagnostics: list[str] = Field(default_factory=list)
    total_records: int = 0


class CommitRequest(BaseModel):
    job_id: str
    target_collection: str
    field_mappings: list[FieldMappingItem]
    root_array_path: Optional[str] = None
    mode: Literal["append", "upsert"] = "append"
    business_key: Optional[str] = None


class CommitResponse(BaseModel):
    inserted_count: int
    upserted_count: int = 0
    quarantined_count: int = 0
    target_collection: str
    status: str = "committed"
    message: str = "Records committed successfully"
