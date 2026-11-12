import math
import re
from typing import Any


def sanitize_bson_value(val: Any) -> Any:
    """Sanitize float('nan'), None, pd.NA, numpy types for BSON compatibility."""
    if val is None:
        return None
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    # Check pandas/numpy NA or NaN
    val_str = str(val)
    if val_str in ("<NA>", "NaN", "nan", "NaT"):
        return None
    if isinstance(val, dict):
        return {k: sanitize_bson_value(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [sanitize_bson_value(v) for v in val]
    return val


def _parse_path_tokens(path: str) -> list[str | int]:
    """Parse dotted and bracketed paths into tokens, e.g.:
    'financials.grand_total' -> ['financials', 'grand_total']
    'items[0].amount' -> ['items', 0, 'amount']
    'line_items.0.qty' -> ['line_items', 0, 'qty']
    """
    # Replace [0] with .0
    clean_path = re.sub(r"\[(\d+)\]", r".\1", path)
    raw_tokens = [t for t in clean_path.split(".") if t]
    tokens: list[str | int] = []
    for t in raw_tokens:
        if t.isdigit():
            tokens.append(int(t))
        else:
            tokens.append(t)
    return tokens


def unflatten_dict(flat_dict: dict[str, Any]) -> dict[str, Any]:
    """Convert flat dictionary with dotted or bracketed keys into nested BSON subdocuments and arrays.
    Guards against scalar collisions (E13).
    """
    root: dict[str, Any] = {}

    for path, raw_value in flat_dict.items():
        val = sanitize_bson_value(raw_value)
        tokens = _parse_path_tokens(path)
        if not tokens:
            continue

        curr: Any = root
        for i, token in enumerate(tokens[:-1]):
            next_token = tokens[i + 1]

            if isinstance(token, str):
                if not isinstance(curr, dict):
                    # Collision: curr is not a dict
                    break
                if token not in curr or not isinstance(curr[token], (dict, list)):
                    # Initialize container
                    curr[token] = [] if isinstance(next_token, int) else {}
                curr = curr[token]
            elif isinstance(token, int):
                if not isinstance(curr, list):
                    break
                # Extend list if needed
                while len(curr) <= token:
                    curr.append({} if isinstance(next_token, str) else [])
                curr = curr[token]

        last_token = tokens[-1]
        if isinstance(last_token, str) and isinstance(curr, dict):
            curr[last_token] = val
        elif isinstance(last_token, int) and isinstance(curr, list):
            while len(curr) <= last_token:
                curr.append(None)
            curr[last_token] = val

    return sanitize_bson_value(root)
