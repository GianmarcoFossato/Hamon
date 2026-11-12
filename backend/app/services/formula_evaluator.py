import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import re
from typing import Any
from simpleeval import SimpleEval, NameNotDefined


def clean_currency(val: Any) -> float:
    """Sanitize strings like '$1,234.50' or '(50.00)' into float."""
    if val is None or val == "":
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    is_negative = False
    if s.startswith("(") and s.endswith(")"):
        is_negative = True
        s = s[1:-1].strip()
    # Remove currency symbols and comma separators
    s = re.sub(r"[^\d.-]", "", s)
    try:
        res = float(s)
        return -res if is_negative else res
    except (ValueError, TypeError):
        return 0.0


def to_date_iso(val: Any) -> str:
    """Parse various date formats to ISO YYYY-MM-DD string."""
    if not val:
        return ""
    val_str = str(val).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(val_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return val_str


SAFE_FUNCTIONS = {
    "clean_currency": clean_currency,
    "to_date": to_date_iso,
    "round": round,
    "abs": abs,
    "min": min,
    "max": max,
    "len": len,
    "str": str,
    "int": lambda v: int(clean_currency(v)),
    "float": clean_currency,
    "upper": lambda s: str(s).upper() if s is not None else "",
    "lower": lambda s: str(s).lower() if s is not None else "",
    "strip": lambda s: str(s).strip() if s is not None else "",
    "re_sub": lambda pat, repl, s: re.sub(pat, repl, str(s) if s is not None else ""),
    "str_slice": lambda s, start, end=None: str(s)[start:end] if s is not None else "",
}

def _eval_sync(expression: str, names: dict[str, Any]) -> Any:
    """Execute expression in simpleeval AST sandbox."""
    # Check length
    if len(expression) > 10000:
        raise ValueError("Formula expression exceeds 10,000 characters")

    # Guard against dunder traversal (E21)
    if "__" in expression:
        raise ValueError("Security violation: dunder access is forbidden in formula expressions")

    evaluator = SimpleEval(names=names, functions=SAFE_FUNCTIONS)
    return evaluator.eval(expression)


async def evaluate_expression(expression: str, names: dict[str, Any], timeout_seconds: float = 0.5) -> Any:
    """Evaluate expression with simpleeval AST sandbox."""
    try:
        return _eval_sync(expression, names)
    except NameNotDefined as e:
        raise ValueError(f"Unknown variable in formula: {e}")
    except Exception as e:
        raise ValueError(f"Formula evaluation error: {str(e)}")
