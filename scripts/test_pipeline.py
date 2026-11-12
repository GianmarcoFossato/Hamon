#!/usr/bin/env python3
"""End-to-End Pipeline Smoke Test for Hamon Document Extraction & Data Harmonization Platform.
Verifies the complete flow:
1. PDF validation and 150 DPI rendering via pypdfium2
2. Draft-07 schema strict normalization
3. Vision extraction parsing and seam-aware JSON merging
4. BDI schema alignment & DataFrame conversion
5. Formula transformations and BSON unflattening
6. Multi-tenant document materialization and validation
"""

import asyncio
import os
import shutil
import sys
from pathlib import Path
from PIL import Image, ImageDraw
import pypdfium2 as pdfium

# Add backend directory to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"

from app.models.harmonization import FieldMappingItem
from app.services.bdi_service import json_extraction_to_dataframe, materialize_and_cast
from app.services.litellm_service import (
    merge_page_extractions,
    normalize_schema_for_strict_mode,
)
from app.services.pdf_service import _render_page_to_disk_sync, MAX_FILE_SIZE, MAX_PAGE_COUNT
from app.services.unflatten_utils import unflatten_dict


def create_sample_pdf(output_path: Path) -> Path:
    """Create a minimal valid 2-page PDF file using PIL."""
    images = []
    for page_num in (1, 2):
        img = Image.new("RGB", (612, 792), color="white")
        draw = ImageDraw.Draw(img)
        draw.text((50, 50), f"Sample Invoice - Page {page_num}", fill="black")
        draw.text((50, 100), f"Invoice Number: INV-2025-00{page_num}", fill="black")
        draw.text((50, 150), "Line Item A: $120.00", fill="black")
        images.append(img)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    images[0].save(output_path, "PDF", resolution=150.0, save_all=True, append_images=images[1:])
    return output_path


async def run_pipeline_test():
    print("=" * 60)
    print("HAMON E2E PIPELINE SMOKE TEST")
    print("=" * 60)

    test_dir = ROOT_DIR / "data" / "smoke_test"
    test_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = test_dir / "sample_invoice.pdf"

    try:
        # Step 1: Create and validate sample PDF
        print("[1/6] Generating sample 2-page PDF...")
        create_sample_pdf(pdf_path)
        file_size = os.path.getsize(pdf_path)
        assert file_size <= MAX_FILE_SIZE, f"File exceeds {MAX_FILE_SIZE} bytes"

        doc = pdfium.PdfDocument(str(pdf_path))
        page_count = len(doc)
        doc.close()
        assert page_count == 2, f"Expected 2 pages, got {page_count}"
        assert page_count <= MAX_PAGE_COUNT, f"Exceeds max {MAX_PAGE_COUNT} pages"
        print(f"      [OK] Saved and validated PDF ({page_count} pages, {file_size} bytes)")

        # Step 2: Render pages at 150 DPI
        print("[2/6] Rendering pages to 150 DPI PNG images via pypdfium2...")
        pages_dir = test_dir / "pages"
        pages_dir.mkdir(parents=True, exist_ok=True)
        rendered_images = []
        for page_idx in range(page_count):
            out_png = pages_dir / f"page_{page_idx}.png"
            _render_page_to_disk_sync(str(pdf_path), page_idx, str(out_png), is_pdf=True)
            rendered_images.append(out_png)

        assert len(rendered_images) == 2, f"Expected 2 rendered images, got {len(rendered_images)}"
        for img_p in rendered_images:
            assert Path(img_p).exists(), f"Rendered image does not exist: {img_p}"
            with Image.open(img_p) as im:
                assert im.size[0] > 0 and im.size[1] > 0
        print(f"      [OK] Rendered {len(rendered_images)} page images successfully")

        # Step 3: Schema Normalization to OpenAI Strict Output Mode
        print("[3/6] Normalizing Draft-07 JSON Schema to OpenAI strict mode...")
        draft7_schema = {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "invoice_number": {"type": "string", "description": "Unique invoice identifier"},
                "invoice_date": {"type": "string", "format": "date", "description": "Date of billing"},
                "currency": {"type": "string"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "sku": {"type": "string"},
                            "description": {"type": "string"},
                            "quantity": {"type": "integer"},
                            "price": {"type": "number"},
                        },
                    },
                },
            },
        }

        strict_schema = normalize_schema_for_strict_mode(draft7_schema)
        assert strict_schema["additionalProperties"] is False
        assert "$schema" not in strict_schema
        assert "invoice_number" in strict_schema["required"]
        assert "items" in strict_schema["required"]
        assert strict_schema["properties"]["items"]["items"]["additionalProperties"] is False
        print("      [OK] Schema normalized with strict additionalProperties=False and full required keys")

        # Step 4: Multi-page Extraction & Seam Deduplication
        print("[4/6] Merging multi-page extractions with seam deduplication...")
        page1_res = {
            "invoice_number": "INV-2025-001",
            "invoice_date": "2025-04-10",
            "currency": "EUR",
            "items": [
                {"sku": "SKU-A", "description": "Widget A", "quantity": 2, "price": 50.0},
                {"sku": "SKU-B", "description": "Widget B", "quantity": 1, "price": 100.0},
            ],
        }
        page2_res = {
            "invoice_number": "",  # Empty scalar on page 2, should not overwrite page 1
            "invoice_date": "",
            "currency": "EUR",
            "items": [
                # Seam duplicate of SKU-B
                {"sku": "SKU-B", "description": "Widget B", "quantity": 1, "price": 100.0},
                {"sku": "SKU-C", "description": "Widget C", "quantity": 3, "price": 75.0},
            ],
        }

        merged = merge_page_extractions([page1_res, page2_res], draft7_schema)
        assert merged["invoice_number"] == "INV-2025-001"
        assert len(merged["items"]) == 3, f"Expected 3 deduplicated items, got {len(merged['items'])}"
        assert [it["sku"] for it in merged["items"]] == ["SKU-A", "SKU-B", "SKU-C"]
        print(f"      [OK] Seam duplicate SKU-B removed, {len(merged['items'])} line items preserved")

        # Step 5: BDI DataFrame Normalization
        print("[5/6] Normalizing extracted payload to pandas DataFrame...")
        df = json_extraction_to_dataframe(merged)
        assert len(df) == 3
        assert "sku" in df.columns
        assert "invoice_number" in df.columns
        assert df["invoice_number"].iloc[0] == "INV-2025-001"
        print(f"      [OK] Extraction normalized into DataFrame with {len(df)} rows and {len(df.columns)} columns")

        # Step 6: Materialization, AST Formula Transforms, and BSON Unflattening
        print("[6/6] Executing BDI Harmonization with formula transforms and BSON unflattening...")
        mappings = [
            FieldMappingItem(source_path="invoice_number", target_field="metadata.doc_code", transform="trim"),
            FieldMappingItem(source_path="sku", target_field="product.sku_id", transform="trim"),
            FieldMappingItem(source_path="quantity", target_field="product.qty", transform="int"),
            FieldMappingItem(source_path="price", target_field="product.unit_cost", transform="clean_currency"),
            FieldMappingItem(
                source_path="",
                target_field="financials.line_total",
                transform="formula",
                transform_args={"expression": "round(quantity * price, 2)"},
            ),
            FieldMappingItem(source_path="", target_field="status", transform="constant", transform_args={"value": "SYNCED"}),
        ]

        materialized, diagnostics = materialize_and_cast(df, mappings, tenant_id="tenant_acme")
        assert len(materialized) == 3, f"Expected 3 materialized docs, got {len(materialized)}"
        assert len(diagnostics) == 0, f"Unexpected diagnostics: {diagnostics}"

        # Verify unflattened BSON structure for Row 1
        doc1 = materialized[0]
        assert doc1["tenant_id"] == "tenant_acme"
        assert doc1["status"] == "SYNCED"
        assert doc1["metadata"]["doc_code"] == "INV-2025-001"
        assert doc1["product"]["sku_id"] == "SKU-A"
        assert doc1["product"]["qty"] == 2
        assert doc1["product"]["unit_cost"] == 50.0
        assert doc1["financials"]["line_total"] == 100.0

        # Verify Row 3
        doc3 = materialized[2]
        assert doc3["product"]["sku_id"] == "SKU-C"
        assert doc3["financials"]["line_total"] == 225.0

        print("      [OK] Materialized 3 harmonized documents:")
        for idx, doc in enumerate(materialized):
            print(f"         Row {idx+1}: SKU={doc['product']['sku_id']}, Qty={doc['product']['qty']}, Total={doc['financials']['line_total']}, Status={doc['status']}")

        print("=" * 60)
        print("ALL E2E PIPELINE CHECKS PASSED SUCCESSFULLY [OK]")
        print("=" * 60)

    finally:
        # Cleanup test artifacts
        if test_dir.exists():
            shutil.rmtree(test_dir, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(run_pipeline_test())
