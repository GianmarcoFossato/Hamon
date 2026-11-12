import asyncio
from datetime import datetime
import json
import logging
import re
from typing import Any, Optional
from bson import ObjectId
from fastapi import HTTPException
import pandas as pd
import litellm

from app.config import get_settings
from app.database import get_target_client
from app.models.harmonization import FieldMappingItem
from app.services.formula_evaluator import clean_currency, to_date_iso, _eval_sync
from app.services.unflatten_utils import unflatten_dict, sanitize_bson_value

try:
    import bdikit
except ImportError:
    bdikit = None

logger = logging.getLogger(__name__)
settings = get_settings()

COLLECTION_NAME_REGEX = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")


def validate_collection_name(name: str):
    """Validate collection name to prevent NoSQL injection (E17)."""
    if not name or not COLLECTION_NAME_REGEX.match(name) or name.startswith("system.") or "$" in name:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid collection name '{name}'. Must be alphanumeric/hyphen/underscore (1-64 chars), and not start with 'system.' or contain '$'.",
        )


async def target_collection_to_dataframe(collection_name: str, sample_size: int = 100) -> pd.DataFrame:
    """Sample documents from target enterprise MongoDB and convert to DataFrame safely (E16, E17)."""
    validate_collection_name(collection_name)
    client = get_target_client()
    try:
        db = client.get_default_database()
    except Exception:
        db = client["company_enterprise_db"]

    col = db[collection_name]
    cursor = col.find({}, limit=sample_size)
    docs: list[dict[str, Any]] = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        docs.append(doc)

    if not docs:
        return pd.DataFrame()

    return pd.json_normalize(docs)


def json_extraction_to_dataframe(raw_extraction: Any, root_array_path: Optional[str] = None) -> pd.DataFrame:
    """Convert extracted JSON payload to DataFrame using pd.json_normalize baseline (DEC-1.4)."""
    if not raw_extraction:
        return pd.DataFrame()

    if isinstance(raw_extraction, list):
        return pd.json_normalize(raw_extraction)

    if isinstance(raw_extraction, dict):
        if root_array_path and root_array_path in raw_extraction:
            target_list = raw_extraction[root_array_path]
            if isinstance(target_list, list):
                return pd.json_normalize(target_list)

        # Detect candidate line items or list fields
        for k, v in raw_extraction.items():
            if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict):
                # We can normalize the line items, enriching with scalar top-level fields
                df_items = pd.json_normalize(v)
                top_level_scalars = {
                    sk: sv for sk, sv in raw_extraction.items()
                    if not isinstance(sv, (list, dict))
                }
                for sk, sv in top_level_scalars.items():
                    df_items[sk] = sv
                return df_items

        # Top-level object as single row
        return pd.json_normalize([raw_extraction])

    return pd.DataFrame()


async def match_schema_llm(
    source_fields: list[str],
    target_fields: list[str],
    source_samples: Optional[dict[str, list[Any]]] = None,
) -> list[dict[str, Any]]:
    """LLM-driven schema matching default (DEC-5.3)."""
    prompt = f"""You are an enterprise data harmonization specialist.
Your task is to map source fields extracted from documents to target enterprise MongoDB collection fields.

Source fields:
{json.dumps(source_fields, indent=2)}

Target collection fields:
{json.dumps(target_fields, indent=2)}

Sample values from source:
{json.dumps(source_samples or {}, default=str, indent=2)}

For each source field, find the best matching target field.
Return a JSON array of objects with the exact schema:
[
  {{
    "source_attribute": "source_field_name",
    "target_attribute": "target_field_name",
    "similarity": 0.95,
    "suggested_transform": "direct"
  }}
]
suggested_transform must be one of: "direct", "trim", "string", "int", "float", "clean_currency", "iso_date", "boolean", "object_id".
Only include confident matches (similarity >= 0.5). If no good match exists, omit the field.
Return ONLY valid JSON.
"""
    try:
        kwargs: dict[str, Any] = {
            "model": settings.LLM_MODEL,
            "messages": [
                {"role": "system", "content": "You are a data harmonization expert. Output only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.0,
        }
        if settings.LLM_API_BASE:
            kwargs["api_base"] = settings.LLM_API_BASE
        if settings.LLM_API_KEY:
            kwargs["api_key"] = settings.LLM_API_KEY

        resp = await litellm.acompletion(**kwargs)
        content = resp.choices[0].message.content or "[]"
        # Parse json
        content = content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        matches = json.loads(content.strip())
        if isinstance(matches, list):
            return matches
    except Exception as e:
        logger.warning(f"LLM schema matching failed ({e}), falling back to heuristic/string matching.")

    return match_schema_heuristic(source_fields, target_fields)


def match_schema_heuristic(source_fields: list[str], target_fields: list[str]) -> list[dict[str, Any]]:
    """Heuristic / Jaccard / Levenshtein schema matching fallback (E19)."""
    results: list[dict[str, Any]] = []

    def _normalize_name(name: str) -> set[str]:
        parts = re.split(r"[._\-\s]+", name.lower())
        return set(p for p in parts if p)

    for s in source_fields:
        s_tokens = _normalize_name(s)
        best_target = None
        best_score = 0.0

        for t in target_fields:
            t_tokens = _normalize_name(t)
            if not s_tokens or not t_tokens:
                continue
            intersection = len(s_tokens & t_tokens)
            union = len(s_tokens | t_tokens)
            score = intersection / union if union > 0 else 0.0

            if s.lower() == t.lower():
                score = 1.0

            if score > best_score:
                best_score = score
                best_target = t

        if best_target and best_score >= 0.3:
            suggested = "direct"
            if any(k in s.lower() for k in ("date", "time", "day", "period")):
                suggested = "iso_date"
            elif any(k in s.lower() for k in ("price", "amount", "total", "cost", "sum", "tax", "fee")):
                suggested = "clean_currency"
            elif any(k in s.lower() for k in ("count", "qty", "quantity", "num")):
                suggested = "int"

            results.append({
                "source_attribute": s,
                "target_attribute": best_target,
                "similarity": round(best_score, 2),
                "suggested_transform": suggested,
            })

    return results


async def match_schema(
    source_df: pd.DataFrame,
    target_df: pd.DataFrame,
    method: str = "llm",
    source_samples: Optional[dict[str, list[Any]]] = None,
) -> list[dict[str, Any]]:
    """Schema matching entry point supporting LLM-driven and BDI-Kit (DEC-5.3, E19)."""
    source_cols = list(source_df.columns)
    target_cols = [c for c in target_df.columns if c != "_id"] if not target_df.empty else []

    if not target_cols:
        return []

    if method == "llm":
        return await match_schema_llm(source_cols, target_cols, source_samples)

    if bdikit is not None and not source_df.empty and not target_df.empty:
        try:
            bdi_matches_df = bdikit.match_schema(source_df, target_df, method=method)
            results = []
            for _, row in bdi_matches_df.iterrows():
                results.append({
                    "source_attribute": str(row["source_attribute"]),
                    "target_attribute": str(row["target_attribute"]),
                    "similarity": round(float(row.get("similarity", 0.8)), 2),
                    "suggested_transform": "direct",
                })
            return results
        except Exception as e:
            logger.warning(f"bdikit.match_schema failed with method {method}: {e}")

    return match_schema_heuristic(source_cols, target_cols)


def match_values(
    source_df: pd.DataFrame,
    target_df: pd.DataFrame,
    source_col: str,
    target_col: str,
) -> list[dict[str, Any]]:
    """Value translation matching entry point."""
    if source_col not in source_df.columns or target_col not in target_df.columns:
        return []

    if bdikit is not None and not source_df.empty and not target_df.empty:
        try:
            val_matches_df = bdikit.match_values(
                source_df,
                target_df,
                attribute_matches=(source_col, target_col),
            )
            return val_matches_df.to_dict(orient="records")
        except Exception as e:
            logger.warning(f"bdikit.match_values failed: {e}")

    # Fallback exact / normalized value match
    s_vals = source_df[source_col].dropna().unique().tolist()
    t_vals = target_df[target_col].dropna().unique().tolist()
    matches = []
    for sv in s_vals:
        sv_str = str(sv).strip().lower()
        for tv in t_vals:
            tv_str = str(tv).strip().lower()
            if sv_str == tv_str:
                matches.append({
                    "source_attribute": source_col,
                    "target_attribute": target_col,
                    "source_value": sv,
                    "target_value": tv,
                    "similarity": 1.0,
                })
                break
    return matches


def apply_field_transform(
    val: Any,
    transform: str,
    args: Optional[dict[str, Any]],
    row_dict: dict[str, Any],
) -> Any:
    """Apply transformation recipe or formula to value."""
    if transform == "direct":
        return val
    elif transform == "trim":
        return str(val).strip() if val is not None else ""
    elif transform == "string":
        return str(val) if val is not None else ""
    elif transform == "int":
        return int(clean_currency(val))
    elif transform in ("float", "clean_currency"):
        return clean_currency(val)
    elif transform == "iso_date":
        return to_date_iso(val)
    elif transform == "boolean":
        if isinstance(val, bool):
            return val
        s = str(val).strip().lower()
        return s in ("true", "1", "yes", "y", "t")
    elif transform == "object_id":
        if isinstance(val, str) and ObjectId.is_valid(val):
            return ObjectId(val)
        return ObjectId()
    elif transform == "constant":
        return args.get("value") if args else None
    elif transform == "formula":
        expr = args.get("expression", "") if args else ""
        if expr:
            return _eval_sync(expr, row_dict)
        return val

    return val


def materialize_and_cast(
    source_df: pd.DataFrame,
    field_mappings: list[FieldMappingItem],
    tenant_id: str = "default_tenant",
) -> tuple[list[dict[str, Any]], list[str]]:
    """Transform source DataFrame into harmonized BSON documents with diagnostics."""
    diagnostics: list[str] = []
    materialized: list[dict[str, Any]] = []

    if source_df.empty:
        return [], ["Source DataFrame is empty"]

    records = source_df.to_dict(orient="records")

    for row_idx, row in enumerate(records):
        flat_doc: dict[str, Any] = {}
        row_dict = {str(k): v for k, v in row.items()}

        for m in field_mappings:
            raw_val = row.get(m.source_path)
            try:
                transformed = apply_field_transform(
                    raw_val,
                    m.transform,
                    m.transform_args,
                    row_dict,
                )
                flat_doc[m.target_field] = transformed
            except Exception as e:
                diagnostics.append(
                    f"Row {row_idx + 1}: Transform '{m.transform}' failed on '{m.source_path}' -> '{m.target_field}': {e}"
                )
                flat_doc[m.target_field] = None

        # Unflatten dot-paths and numeric paths (E13)
        nested_doc = unflatten_dict(flat_doc)
        # Ensure multi-tenancy logical isolation (DEC-4.3)
        nested_doc["tenant_id"] = tenant_id

        materialized.append(nested_doc)

    return materialized, diagnostics
