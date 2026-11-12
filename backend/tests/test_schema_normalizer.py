import pytest
from fastapi import HTTPException
from app.services.litellm_service import normalize_schema_for_strict_mode


def test_normalize_schema_basic_object():
    draft7_schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "invoice_id": {"type": "string", "description": "The invoice ID"},
            "total_amount": {"type": "number"},
        },
    }

    strict = normalize_schema_for_strict_mode(draft7_schema)
    assert "$schema" not in strict
    assert strict["additionalProperties"] is False
    assert set(strict["required"]) == {"invoice_id", "total_amount"}
    assert strict["properties"]["invoice_id"]["type"] == "string"


def test_normalize_schema_nested_arrays_and_objects():
    draft7_schema = {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "sku": {"type": "string"},
                        "qty": {"type": "integer"},
                    },
                },
            }
        },
    }

    strict = normalize_schema_for_strict_mode(draft7_schema)
    assert strict["additionalProperties"] is False
    assert "items" in strict["required"]
    item_schema = strict["properties"]["items"]["items"]
    assert item_schema["additionalProperties"] is False
    assert set(item_schema["required"]) == {"sku", "qty"}


def test_normalize_schema_format_to_description():
    draft7_schema = {
        "type": "object",
        "properties": {
            "created_at": {
                "type": "string",
                "format": "date-time",
                "description": "Creation timestamp",
            }
        },
    }

    strict = normalize_schema_for_strict_mode(draft7_schema)
    assert "format" not in strict["properties"]["created_at"]
    assert "Format: date-time" in strict["properties"]["created_at"]["description"]


def test_normalize_schema_rejects_forbidden_constraints():
    # E05 / DEC-5.5: forbidden pattern, minLength, minimum, etc.
    forbidden_cases = [
        {"type": "object", "properties": {"code": {"type": "string", "pattern": "^[A-Z0-9]+$"}}},
        {"type": "object", "properties": {"amount": {"type": "number", "minimum": 0}}},
        {"type": "object", "properties": {"tags": {"type": "array", "uniqueItems": True, "items": {"type": "string"}}}},
    ]

    for schema in forbidden_cases:
        with pytest.raises(HTTPException) as exc_info:
            normalize_schema_for_strict_mode(schema)
        assert exc_info.value.status_code == 400
        assert "not supported in OpenAI strict structured output mode" in exc_info.value.detail
