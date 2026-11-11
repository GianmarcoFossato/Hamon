from datetime import datetime
from typing import Any, Optional
from fastapi import HTTPException
import jsonschema
from pydantic import BaseModel, ConfigDict, Field


def validate_draft7_schema(schema: Any) -> None:
    """Validates that a schema is a valid Draft-07 JSON Schema with a root object type.

    Raises:
        HTTPException: HTTP 400 if schema is not a dict, root type != 'object',
                       or schema fails Draft-07 specification checks.
    """
    if not isinstance(schema, dict):
        raise HTTPException(
            status_code=400,
            detail="JSON Schema must be a valid JSON object/dictionary.",
        )
    if schema.get("type") != "object":
        raise HTTPException(
            status_code=400,
            detail="Schema root 'type' must be 'object'.",
        )
    try:
        jsonschema.Draft7Validator.check_schema(schema)
    except jsonschema.exceptions.SchemaError as err:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid Draft-07 JSON Schema: {err.message}",
        )


class SchemaCreate(BaseModel):
    name: str = Field(..., description="Unique or descriptive name of the schema")
    description: Optional[str] = Field(None, description="Detailed explanation of schema's purpose")
    json_schema: dict[str, Any] = Field(..., description="Draft-07 JSON Schema definition")


class SchemaUpdate(BaseModel):
    name: Optional[str] = Field(None, description="Updated name of the schema")
    description: Optional[str] = Field(None, description="Updated description")
    json_schema: Optional[dict[str, Any]] = Field(None, description="Updated Draft-07 JSON Schema")


class SchemaResponse(BaseModel):
    id: str = Field(..., description="Hexadecimal MongoDB document identifier")
    name: str = Field(..., description="Name of the schema")
    description: Optional[str] = Field(None, description="Detailed explanation of schema's purpose")
    json_schema: dict[str, Any] = Field(..., description="Draft-07 JSON Schema definition")
    created_at: datetime = Field(..., description="UTC creation timestamp")
    updated_at: datetime = Field(..., description="UTC update timestamp")

    model_config = ConfigDict(populate_by_name=True)
