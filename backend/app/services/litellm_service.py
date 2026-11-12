import asyncio
import base64
import copy
import io
import json
import logging
import random
import re
from typing import Any, Optional
from fastapi import HTTPException
from PIL import Image
import jsonschema
import litellm

from lift.model.util import scale_to_fit, detect_repeat_token
from lift.prompts import DIRECT_EXTRACTION_PROMPT
from app.config import get_settings
from app.models.job import TokenUsage

logger = logging.getLogger(__name__)
settings = get_settings()

FORBIDDEN_STRICT_CONSTRAINTS = {
    "pattern", "minimum", "maximum", "minLength", "maxLength",
    "minItems", "maxItems", "uniqueItems", "multipleOf",
}


def _check_unsupported_constraints(node: Any, path: str = ""):
    """Pre-flight check rejecting Draft-07 constraints unsupported by OpenAI strict mode (DEC-5.5, E05)."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k in FORBIDDEN_STRICT_CONSTRAINTS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Schema constraint '{k}' at path '{path or '/'}' is not supported in OpenAI strict structured output mode.",
                )
            _check_unsupported_constraints(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for idx, item in enumerate(node):
            _check_unsupported_constraints(item, f"{path}[{idx}]")


def normalize_schema_for_strict_mode(schema: dict[str, Any]) -> dict[str, Any]:
    """Normalize Draft-07 schema to OpenAI strict structured outputs (DEC-5.5, E05)."""
    # 1. Validate Draft-07 compliance (E03)
    try:
        jsonschema.Draft7Validator.check_schema(schema)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Draft-07 JSON Schema: {str(e)}")

    # 2. Check forbidden constraints
    _check_unsupported_constraints(schema)

    # 3. Deepcopy to prevent in-place mutation
    norm = copy.deepcopy(schema)

    def _normalize_node(node: Any) -> Any:
        if not isinstance(node, dict):
            return node

        # Remove unsupported keywords
        node.pop("$schema", None)
        node.pop("id", None)
        node.pop("$id", None)
        node.pop("default", None)

        # Convert format to description hint if format exists
        fmt = node.pop("format", None)
        if fmt:
            desc = node.get("description", "")
            node["description"] = f"{desc} (Format: {fmt})".strip()

        # Handle type array unpacking e.g. ["string", "null"] -> wrap with anyOf
        node_type = node.get("type")
        if isinstance(node_type, list):
            types_without_null = [t for t in node_type if t != "null"]
            primary_type = types_without_null[0] if types_without_null else "string"
            node["type"] = primary_type
            if "null" in node_type:
                node = {
                    "anyOf": [
                        _normalize_node(node),
                        {"type": "null"},
                    ]
                }
                return node

        if node.get("type") == "object":
            node["additionalProperties"] = False
            props = node.get("properties", {})
            if isinstance(props, dict):
                # OpenAI strict requires all keys to be in 'required'
                node["required"] = list(props.keys())
                for k, v in props.items():
                    props[k] = _normalize_node(v)

        elif node.get("type") == "array":
            items = node.get("items")
            if isinstance(items, dict):
                node["items"] = _normalize_node(items)
            elif isinstance(items, list):
                node["items"] = [_normalize_node(it) for it in items]

        # Normalize anyOf, allOf, oneOf
        for comb in ("anyOf", "allOf", "oneOf"):
            if comb in node and isinstance(node[comb], list):
                node[comb] = [_normalize_node(it) for it in node[comb]]

        return node

    return _normalize_node(norm)


def scale_and_encode_image(image_path: str) -> str:
    """Scale image aspect ratio via lift scale_to_fit and return base64 data URI (E06)."""
    with Image.open(image_path) as img:
        rgb_img = img.convert("RGB")
        scaled_img = scale_to_fit(rgb_img, max_size=(1088, 1408), grid_size=28)
        buffer = io.BytesIO()
        scaled_img.save(buffer, format="PNG")
        b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{b64_str}"


async def _call_litellm_with_retry(
    messages: list[dict[str, Any]],
    strict_schema: dict[str, Any],
    temperature: float = 0.0,
    max_retries: int = 3,
) -> tuple[dict[str, Any], TokenUsage]:
    """Call LiteLLM with jitter backoff on 429/503 and repeat loop detection (E07, E08, DEC-3.2)."""
    curr_temp = temperature
    last_err: Optional[Exception] = None

    for attempt in range(max_retries):
        try:
            kwargs: dict[str, Any] = {
                "model": settings.LLM_MODEL,
                "messages": messages,
                "temperature": curr_temp,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "document_extraction",
                        "schema": strict_schema,
                        "strict": True,
                    },
                },
            }
            if settings.LLM_API_BASE:
                kwargs["api_base"] = settings.LLM_API_BASE
            if settings.LLM_API_KEY:
                kwargs["api_key"] = settings.LLM_API_KEY

            response = await litellm.acompletion(**kwargs)
            content = response.choices[0].message.content or "{}"

            # Repeat loop detection (E07)
            if detect_repeat_token(content):
                logger.warning(f"Repeat token loop detected on attempt {attempt+1}, retrying with temp=0.3...")
                curr_temp = 0.3
                continue

            parsed = json.loads(content)

            # Token accumulation
            usage = getattr(response, "usage", None)
            tokens = TokenUsage(
                prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
                total_tokens=getattr(usage, "total_tokens", 0) or 0,
            )
            return parsed, tokens

        except json.JSONDecodeError as jde:
            logger.warning(f"JSON decode error on attempt {attempt+1}: {jde}")
            curr_temp = 0.3
            last_err = jde
        except Exception as e:
            err_msg = str(e).lower()
            last_err = e
            is_rate_limit = "429" in err_msg or "rate limit" in err_msg or "503" in err_msg
            if is_rate_limit and attempt < max_retries - 1:
                # Full jitter exponential backoff: 2^attempt + jitter
                delay = (2 ** attempt) + random.uniform(0.1, 1.0)
                logger.warning(f"Rate limited (attempt {attempt+1}), backing off for {delay:.2f}s: {e}")
                await asyncio.sleep(delay)
            else:
                if attempt == max_retries - 1:
                    raise last_err

    raise last_err or RuntimeError("Failed extraction call after retries")


def _is_truthy_scalar(val: Any) -> bool:
    """Preserves 0, 0.0, and False as truthy scalars while rejecting None and empty strings (E09)."""
    return val is not None and val != "" and not isinstance(val, (list, dict))


def merge_page_extractions(page_results: list[dict[str, Any]], original_schema: dict[str, Any]) -> dict[str, Any]:
    """Deterministic schema-guided merger with seam-only array deduplication (E09, E10)."""
    if not page_results:
        return {}
    if len(page_results) == 1:
        return page_results[0]

    merged: dict[str, Any] = {}
    schema_props = original_schema.get("properties", {})

    # Collect all keys
    all_keys = set()
    for res in page_results:
        all_keys.update(res.keys())

    for key in all_keys:
        prop_def = schema_props.get(key, {})
        prop_type = prop_def.get("type", "string")

        # Determine if array, object, or scalar
        is_array = prop_type == "array" or any(isinstance(res.get(key), list) for res in page_results)
        is_object = prop_type == "object" or any(isinstance(res.get(key), dict) for res in page_results)

        if is_array:
            accumulated: list[Any] = []
            for res in page_results:
                items = res.get(key)
                if not isinstance(items, list):
                    continue
                for idx, item in enumerate(items):
                    # Seam-only deduplication (E10): compare ONLY the first item of page k with the last item of accumulated
                    if idx == 0 and accumulated and item == accumulated[-1]:
                        continue
                    accumulated.append(item)
            merged[key] = accumulated

        elif is_object:
            sub_results = [res[key] for res in page_results if isinstance(res.get(key), dict)]
            merged[key] = merge_page_extractions(sub_results, prop_def)

        else:
            # Scalar: first valid truthy scalar (strictly preserving 0, 0.0, False)
            chosen = None
            for res in page_results:
                val = res.get(key)
                if _is_truthy_scalar(val):
                    chosen = val
                    break
            merged[key] = chosen

    return merged


async def execute_extraction_pipeline(
    job_id: str,
    image_paths: list[str],
    original_schema: dict[str, Any],
    on_progress: Optional[Any] = None,
) -> tuple[dict[str, Any], TokenUsage, list[int], str]:
    """Execute LiteLLM vision extraction with 3-page threshold & token accumulation (DEC-6.3, DEC-6.4)."""
    strict_schema = normalize_schema_for_strict_mode(original_schema)
    prompt_text = DIRECT_EXTRACTION_PROMPT.replace("{schema}", json.dumps(original_schema, indent=2))

    total_tokens = TokenUsage()
    page_count = len(image_paths)

    # 1. Small document (<= 3 pages): Single multi-modal completion call (DEC-6.4)
    if page_count <= 3:
        if on_progress:
            await on_progress("extracting", 20, "Dispatching single multi-modal completion call...")

        content: list[dict[str, Any]] = []
        for img_path in image_paths:
            b64_url = scale_and_encode_image(img_path)
            content.append({"type": "image_url", "image_url": {"url": b64_url}})
        content.append({"type": "text", "text": prompt_text})

        messages = [
            {"role": "system", "content": "You are a professional enterprise document extraction specialist. Extract the data accurately matching the provided schema."},
            {"role": "user", "content": content},
        ]

        try:
            raw_result, tokens = await _call_litellm_with_retry(messages, strict_schema)
            total_tokens.prompt_tokens += tokens.prompt_tokens
            total_tokens.completion_tokens += tokens.completion_tokens
            total_tokens.total_tokens += tokens.total_tokens
            return raw_result, total_tokens, [], "completed"
        except Exception as e:
            logger.exception("Single call extraction failed: %s", e)
            failed_pages = list(range(page_count))
            return {}, total_tokens, failed_pages, "failed"

    # 2. Large document (> 3 pages): Parallel throttled dispatch with Semaphore(5) (DEC-6.3)
    semaphore = asyncio.Semaphore(5)
    page_results: list[Optional[dict[str, Any]]] = [None] * page_count
    failed_pages: list[int] = []

    async def _extract_page(page_idx: int, img_path: str):
        nonlocal total_tokens
        async with semaphore:
            b64_url = scale_and_encode_image(img_path)
            content = [
                {"type": "image_url", "image_url": {"url": b64_url}},
                {"type": "text", "text": f"{prompt_text}\n\nNote: This is page {page_idx+1} of {page_count}."},
            ]
            messages = [
                {"role": "system", "content": "You are an enterprise document extraction specialist. Extract only data present on this page."},
                {"role": "user", "content": content},
            ]
            try:
                res, tokens = await _call_litellm_with_retry(messages, strict_schema)
                page_results[page_idx] = res
                total_tokens.prompt_tokens += tokens.prompt_tokens
                total_tokens.completion_tokens += tokens.completion_tokens
                total_tokens.total_tokens += tokens.total_tokens
            except Exception as exc:
                logger.error("Page %s extraction failed: %s", page_idx, exc)
                failed_pages.append(page_idx)

    tasks = [_extract_page(idx, path) for idx, path in enumerate(image_paths)]
    await asyncio.gather(*tasks)

    # Check overall success / failure
    if len(failed_pages) == page_count:
        return {}, total_tokens, failed_pages, "failed"

    # Collect successful page extractions in original page order
    valid_results = [res for res in page_results if res is not None]

    if on_progress:
        await on_progress("merging", 85, "Merging multi-page extraction results...")

    merged_extraction = merge_page_extractions(valid_results, original_schema)
    status = "partial_success" if failed_pages else "completed"

    return merged_extraction, total_tokens, failed_pages, status
