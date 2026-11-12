import pytest
import asyncio
from app.services.formula_evaluator import evaluate_expression, clean_currency, to_date_iso


def test_clean_currency():
    assert clean_currency("$1,234.50") == 1234.50
    assert clean_currency("(50.00)") == -50.00
    assert clean_currency("€ 99.99") == 99.99
    assert clean_currency(100) == 100.0
    assert clean_currency(None) == 0.0
    assert clean_currency("") == 0.0
    assert clean_currency("invalid") == 0.0


def test_to_date_iso():
    assert to_date_iso("2025-03-15") == "2025-03-15"
    assert to_date_iso("03/15/2025") == "2025-03-15"
    assert to_date_iso("15/03/2025") == "2025-03-15"
    assert to_date_iso("15-03-2025") == "2025-03-15"
    assert to_date_iso("15-Mar-2025") == "2025-03-15"
    assert to_date_iso("") == ""
    assert to_date_iso(None) == ""


@pytest.mark.asyncio
async def test_evaluate_expression_basic_arithmetic():
    context = {"qty": 5, "unit_price": 19.99, "discount": 10.0}
    result = await evaluate_expression("round(qty * unit_price - discount, 2)", context)
    assert result == 89.95


@pytest.mark.asyncio
async def test_evaluate_expression_string_helpers():
    context = {"company": "  acme corp  ", "code": "inv-2025-001"}
    upper_res = await evaluate_expression("upper(strip(company))", context)
    assert upper_res == "ACME CORP"

    sub_res = await evaluate_expression("re_sub('inv-', '', code)", context)
    assert sub_res == "2025-001"


@pytest.mark.asyncio
async def test_evaluate_expression_currency_and_date():
    context = {"raw_price": "$1,500.00", "raw_date": "12/25/2024"}
    price = await evaluate_expression("clean_currency(raw_price)", context)
    assert price == 1500.0

    date = await evaluate_expression("to_date(raw_date)", context)
    assert date == "2024-12-25"


@pytest.mark.asyncio
async def test_evaluate_expression_dunder_forbidden():
    # E21: dunder traversal forbidden
    with pytest.raises(ValueError, match="dunder access is forbidden"):
        await evaluate_expression("__import__('os').system('ls')", {})


@pytest.mark.asyncio
async def test_evaluate_expression_unknown_variable():
    with pytest.raises(ValueError, match="Unknown variable in formula"):
        await evaluate_expression("unknown_var * 2", {"a": 1})


@pytest.mark.asyncio
async def test_evaluate_expression_length_limit():
    long_expr = "1 + " * 3500 + "1"
    with pytest.raises(ValueError, match="Formula expression exceeds 10,000 characters"):
        await evaluate_expression(long_expr, {})
