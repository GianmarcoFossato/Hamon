import math
import pytest
from app.services.unflatten_utils import unflatten_dict, sanitize_bson_value


def test_sanitize_bson_value():
    assert sanitize_bson_value(None) is None
    assert sanitize_bson_value(float("nan")) is None
    assert sanitize_bson_value(float("inf")) is None
    assert sanitize_bson_value(float("-inf")) is None
    assert sanitize_bson_value(42) == 42
    assert sanitize_bson_value(3.14) == 3.14
    assert sanitize_bson_value("hello") == "hello"
    assert sanitize_bson_value("<NA>") is None
    assert sanitize_bson_value("NaN") is None
    assert sanitize_bson_value("nan") is None

    # Nested structures
    d = {"a": float("nan"), "b": [1, float("inf"), "<NA>"], "c": {"d": "ok"}}
    res = sanitize_bson_value(d)
    assert res == {"a": None, "b": [1, None, None], "c": {"d": "ok"}}


def test_unflatten_simple_dotted():
    flat = {
        "invoice_number": "INV-1001",
        "financials.subtotal": 100.0,
        "financials.tax": 20.0,
        "financials.grand_total": 120.0,
    }
    unflat = unflatten_dict(flat)
    assert unflat == {
        "invoice_number": "INV-1001",
        "financials": {
            "subtotal": 100.0,
            "tax": 20.0,
            "grand_total": 120.0,
        },
    }


def test_unflatten_array_bracket_syntax():
    flat = {
        "items[0].sku": "ITEM-A",
        "items[0].qty": 3,
        "items[1].sku": "ITEM-B",
        "items[1].qty": 7,
    }
    unflat = unflatten_dict(flat)
    assert unflat == {
        "items": [
            {"sku": "ITEM-A", "qty": 3},
            {"sku": "ITEM-B", "qty": 7},
        ]
    }


def test_unflatten_array_dotted_syntax():
    flat = {
        "line_items.0.sku": "A1",
        "line_items.0.amount": 10.5,
        "line_items.1.sku": "B2",
        "line_items.1.amount": 25.0,
    }
    unflat = unflatten_dict(flat)
    assert unflat == {
        "line_items": [
            {"sku": "A1", "amount": 10.5},
            {"sku": "B2", "amount": 25.0},
        ]
    }


def test_unflatten_scalar_collision_prevention():
    # E13: setting a scalar and then a child or vice-versa
    flat = {
        "customer": "ACME Corp",
        "customer.name": "ACME Corp Ltd",
    }
    # Should not throw exception
    unflat = unflatten_dict(flat)
    assert isinstance(unflat, dict)
    assert "customer" in unflat


def test_unflatten_nan_sanitization():
    flat = {
        "val_nan": float("nan"),
        "nested.val_inf": float("inf"),
        "nested.valid": 42.0,
    }
    unflat = unflatten_dict(flat)
    assert unflat["val_nan"] is None
    assert unflat["nested"]["val_inf"] is None
    assert unflat["nested"]["valid"] == 42.0
