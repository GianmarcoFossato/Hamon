import pandas as pd
import pytest
from app.models.harmonization import FieldMappingItem
from app.services.bdi_service import (
    json_extraction_to_dataframe,
    apply_field_transform,
    materialize_and_cast,
    validate_collection_name,
)
from fastapi import HTTPException


def test_validate_collection_name():
    # Valid
    validate_collection_name("invoices")
    validate_collection_name("orders_2025")
    validate_collection_name("user-profiles")

    # Invalid NoSQL injections / system collections
    with pytest.raises(HTTPException):
        validate_collection_name("system.views")
    with pytest.raises(HTTPException):
        validate_collection_name("inv$oices")
    with pytest.raises(HTTPException):
        validate_collection_name("a" * 65)


def test_json_extraction_to_dataframe_nested_line_items():
    raw_data = {
        "invoice_number": "INV-999",
        "vendor": "ACME Supplies",
        "items": [
            {"sku": "SKU-1", "qty": 2, "price": 10.0},
            {"sku": "SKU-2", "qty": 5, "price": 20.0},
        ],
    }

    df = json_extraction_to_dataframe(raw_data)
    assert len(df) == 2
    assert "sku" in df.columns
    assert "qty" in df.columns
    # Top-level scalars enriched into line item rows
    assert df["invoice_number"].iloc[0] == "INV-999"
    assert df["vendor"].iloc[1] == "ACME Supplies"


def test_apply_field_transform():
    row_dict = {"qty": 4, "unit_price": 25.0, "raw_date": "04/15/2025"}

    assert apply_field_transform("  hello  ", "trim", None, row_dict) == "hello"
    assert apply_field_transform("$1,200.50", "clean_currency", None, row_dict) == 1200.50
    assert apply_field_transform("12/31/2024", "iso_date", None, row_dict) == "2024-12-31"
    assert apply_field_transform("yes", "boolean", None, row_dict) is True
    assert apply_field_transform("no", "boolean", None, row_dict) is False
    assert apply_field_transform(None, "constant", {"value": "ACTIVE"}, row_dict) == "ACTIVE"

    # Formula transform
    formula_res = apply_field_transform(
        None, "formula", {"expression": "qty * unit_price"}, row_dict
    )
    assert formula_res == 100.0


def test_materialize_and_cast():
    df = pd.DataFrame([
        {
            "raw_id": "INV-001",
            "raw_amount": "$500.00",
            "date_str": "2025-01-01",
            "line_sku": "SKU-X",
        },
        {
            "raw_id": "INV-002",
            "raw_amount": "$750.50",
            "date_str": "2025-01-02",
            "line_sku": "SKU-Y",
        },
    ])

    mappings = [
        FieldMappingItem(
            source_path="raw_id",
            target_field="invoice_code",
            transform="trim",
        ),
        FieldMappingItem(
            source_path="raw_amount",
            target_field="financials.total",
            transform="clean_currency",
        ),
        FieldMappingItem(
            source_path="date_str",
            target_field="metadata.created_at",
            transform="iso_date",
        ),
        FieldMappingItem(
            source_path="line_sku",
            target_field="sku",
            transform="direct",
        ),
    ]

    docs, diagnostics = materialize_and_cast(df, mappings, tenant_id="tenant_alpha")

    assert len(docs) == 2
    assert len(diagnostics) == 0

    doc1 = docs[0]
    assert doc1["tenant_id"] == "tenant_alpha"
    assert doc1["invoice_code"] == "INV-001"
    assert doc1["financials"]["total"] == 500.0
    assert doc1["metadata"]["created_at"] == "2025-01-01"
    assert doc1["sku"] == "SKU-X"

    doc2 = docs[1]
    assert doc2["invoice_code"] == "INV-002"
    assert doc2["financials"]["total"] == 750.50
