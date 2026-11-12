from app.services.litellm_service import merge_page_extractions, _is_truthy_scalar


def test_is_truthy_scalar():
    # E09: 0, 0.0, and False MUST be preserved as truthy scalars
    assert _is_truthy_scalar(0) is True
    assert _is_truthy_scalar(0.0) is True
    assert _is_truthy_scalar(False) is True
    assert _is_truthy_scalar("hello") is True

    # None and empty strings should NOT be considered truthy scalars
    assert _is_truthy_scalar(None) is False
    assert _is_truthy_scalar("") is False
    assert _is_truthy_scalar([]) is False
    assert _is_truthy_scalar({}) is False


def test_merge_page_extractions_scalar_precedence():
    schema = {
        "type": "object",
        "properties": {
            "invoice_num": {"type": "string"},
            "discount_pct": {"type": "number"},
            "is_tax_exempt": {"type": "boolean"},
        },
    }

    page1 = {"invoice_num": "", "discount_pct": 0.0, "is_tax_exempt": False}
    page2 = {"invoice_num": "INV-2025", "discount_pct": 15.0, "is_tax_exempt": True}

    merged = merge_page_extractions([page1, page2], schema)

    # invoice_num was empty in page 1, so page 2's "INV-2025" is taken
    assert merged["invoice_num"] == "INV-2025"
    # discount_pct was 0.0 in page 1, which is a truthy scalar and must be kept (not overwritten by 15.0)
    assert merged["discount_pct"] == 0.0
    # is_tax_exempt was False in page 1, which is a truthy scalar and must be kept (not overwritten by True)
    assert merged["is_tax_exempt"] is False


def test_merge_page_extractions_seam_deduplication():
    # E10: Seam-only deduplication
    schema = {
        "type": "object",
        "properties": {
            "line_items": {
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

    item_a = {"sku": "SKU-A", "qty": 10}
    item_b = {"sku": "SKU-B", "qty": 5}
    item_c = {"sku": "SKU-C", "qty": 20}

    # Page 1 has [item_a, item_b]
    page1 = {"line_items": [item_a, item_b]}
    # Page 2 repeats item_b at its seam (first item of page 2), then item_c, then item_a again (legitimate repeated line item later)
    page2 = {"line_items": [item_b, item_c, item_a]}

    merged = merge_page_extractions([page1, page2], schema)
    # The duplicate item_b at index 0 of page 2 must be eliminated.
    # But item_a at the end of page 2 must remain!
    assert merged["line_items"] == [item_a, item_b, item_c, item_a]
    assert len(merged["line_items"]) == 4


def test_merge_page_extractions_nested_object():
    schema = {
        "type": "object",
        "properties": {
            "financials": {
                "type": "object",
                "properties": {
                    "subtotal": {"type": "number"},
                    "total": {"type": "number"},
                },
            }
        },
    }

    page1 = {"financials": {"subtotal": 100.0, "total": None}}
    page2 = {"financials": {"subtotal": None, "total": 120.0}}

    merged = merge_page_extractions([page1, page2], schema)
    assert merged["financials"]["subtotal"] == 100.0
    assert merged["financials"]["total"] == 120.0
