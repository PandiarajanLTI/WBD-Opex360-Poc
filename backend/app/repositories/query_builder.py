from dataclasses import dataclass
from typing import Any
from app.schemas.grid import GridQuery
@dataclass
class BuiltQuery:
    sql: str
    params: dict[str, Any]
ALLOWED_COLUMNS = {"UNIQ_ID","TEMPLATE_NAME","VERSION","COMPANY_CODE","PROFIT_CENTER","COST_CENTER","FSI_ACCOUNT","GEOGRAPHY","BRAND","NOTES","JAN_FORECAST","FEB_FORECAST","MAR_FORECAST","APR_FORECAST","MAY_FORECAST","JUN_FORECAST","JUL_FORECAST","AUG_FORECAST","SEP_FORECAST","OCT_FORECAST","NOV_FORECAST","DEC_FORECAST","FY_WORKING_FORECAST"}
SELECT_COLUMNS = ", ".join(sorted(ALLOWED_COLUMNS))


def _conditions(model: dict[str, Any]) -> list[dict[str, Any]]:
    conditions = model.get("conditions")
    if conditions:
        return [
            condition
            if condition.get("filterType")
            else {**condition, "filterType": model.get("filterType", "text")}
            for condition in conditions
        ]
    legacy = [model.get("condition1"), model.get("condition2")]
    conditions = [condition for condition in legacy if condition] or [model]
    return [
        condition
        if condition.get("filterType")
        else {**condition, "filterType": model.get("filterType", "text")}
        for condition in conditions
    ]


def _sql_number_filter(
    column: str, model: dict[str, Any], key: str, params: dict[str, Any]
) -> str | None:
    operation = model.get("type", "contains")
    value = model.get("filter")
    operators = {
        "equals": "=",
        "notEqual": "!=",
        "lessThan": "<",
        "lessThanOrEqual": "<=",
        "greaterThan": ">",
        "greaterThanOrEqual": ">=",
    }
    if operation == "inRange" and model.get("filterTo") is not None:
        params[f"{key}_to"] = model["filterTo"]
        params[key] = value
        return f"{column} BETWEEN %({key})s AND %({key}_to)s"
    operator = operators.get(operation)
    if not operator:
        return None
    params[key] = value
    return f"{column} {operator} %({key})s"


def _sql_text_filter(
    column: str, model: dict[str, Any], key: str, params: dict[str, Any]
) -> str | None:
    operation = model.get("type", "contains")
    text_operators = {
        "equals": "=",
        "notEqual": "!=",
        "contains": "ILIKE",
        "notContains": "NOT ILIKE",
        "startsWith": "ILIKE",
        "endsWith": "ILIKE",
    }
    operator = text_operators.get(operation)
    if not operator:
        return None
    text_value = str(model["filter"])
    if operation in {"contains", "notContains"}:
        text_value = f"%{text_value}%"
    elif operation == "startsWith":
        text_value = f"{text_value}%"
    elif operation == "endsWith":
        text_value = f"%{text_value}"
    params[key] = text_value
    if operation in {"equals", "notEqual"}:
        comparison = "=" if operation == "equals" else "!="
        return f"LOWER({column}) {comparison} LOWER(%({key})s)"
    return f"{column} {operator} %({key})s"


def _sql_filter(
    column: str, model: dict[str, Any], key: str, params: dict[str, Any]
) -> str | None:
    operation = model.get("type", "contains")
    if operation in {"blank", "notBlank"}:
        clause = f"{column} IS NULL OR TRIM(TO_VARCHAR({column})) = ''"
        return f"NOT ({clause})" if operation == "notBlank" else f"({clause})"
    if model.get("filter") is None:
        return None
    if model.get("filterType") == "number":
        return _sql_number_filter(column, model, key, params)
    return _sql_text_filter(column, model, key, params)


def build_filter_clauses(
    filter_model: dict[str, Any], allowed_columns: set[str], params: dict[str, Any]
) -> list[str]:
    clauses = []
    for column, model in filter_model.items():
        if column not in allowed_columns or not isinstance(model, dict):
            continue
        conditions = []
        for condition_index, condition in enumerate(_conditions(model)):
            clause = _sql_filter(
                column,
                condition,
                f"filter_{len(clauses)}_{condition_index}",
                params,
            )
            if clause:
                conditions.append(clause)
        if conditions:
            joiner = " OR " if model.get("operator") == "OR" else " AND "
            clauses.append(f"({joiner.join(conditions)})")
    return clauses


def build_order_clause(sort_model: list[Any], allowed_columns: set[str], fallback: str) -> str:
    order = [
        f"{item.colId} {item.sort.upper()}"
        for item in sort_model
        if item.colId in allowed_columns
    ]
    return ", ".join(order) if order else fallback


def _matches_number(value: Any, model: dict[str, Any]) -> bool:
    try:
        actual = float(value)
        expected = float(model["filter"])
    except (KeyError, TypeError, ValueError):
        return False
    operations = {
        "equals": lambda: actual == expected,
        "notEqual": lambda: actual != expected,
        "lessThan": lambda: actual < expected,
        "lessThanOrEqual": lambda: actual <= expected,
        "greaterThan": lambda: actual > expected,
        "greaterThanOrEqual": lambda: actual >= expected,
        "inRange": lambda: expected <= actual <= float(model.get("filterTo", expected)),
    }
    return operations.get(model.get("type"), lambda: True)()


def _matches_text(value: Any, model: dict[str, Any]) -> bool:
    actual = "" if value is None else str(value).casefold()
    expected = str(model["filter"]).casefold()
    operations = {
        "equals": lambda: actual == expected,
        "notEqual": lambda: actual != expected,
        "notContains": lambda: expected not in actual,
        "startsWith": lambda: actual.startswith(expected),
        "endsWith": lambda: actual.endswith(expected),
        "contains": lambda: expected in actual,
    }
    return operations.get(model.get("type", "contains"), lambda: True)()


def _matches_condition(value: Any, model: dict[str, Any]) -> bool:
    operation = model.get("type", "contains")
    if operation in {"blank", "notBlank"}:
        is_blank = value is None or str(value).strip() == ""
        return is_blank if operation == "blank" else not is_blank
    if model.get("filter") is None:
        return True
    if model.get("filterType") == "number":
        return _matches_number(value, model)
    return _matches_text(value, model)


def matches_filter_model(
    row: dict[str, Any], filter_model: dict[str, Any], allowed_columns: set[str]
) -> bool:
    for column, model in filter_model.items():
        if column not in allowed_columns or not isinstance(model, dict):
            continue
        conditions = _conditions(model)
        results = [_matches_condition(row.get(column), condition) for condition in conditions]
        if results and not (
            any(results) if model.get("operator") == "OR" else all(results)
        ):
            return False
    return True


def sort_rows(rows: list[dict[str, Any]], sort_model: list[Any], allowed_columns: set[str]) -> None:
    for item in reversed(sort_model):
        if item.colId in allowed_columns:
            rows.sort(
                key=lambda row, field=item.colId: (row.get(field) is None, row.get(field)),
                reverse=item.sort == "desc",
            )


def build_grid_query(table: str, template_name: str, request: GridQuery) -> BuiltQuery:
    where = ["TEMPLATE_NAME = %(template_name)s"]
    params: dict[str, Any] = {"template_name": template_name, "limit": request.endRow - request.startRow, "offset": request.startRow}
    where.extend(build_filter_clauses(request.filterModel, ALLOWED_COLUMNS, params))
    order_sql = build_order_clause(request.sortModel, ALLOWED_COLUMNS, "UNIQ_ID ASC")
    sql = f"SELECT {SELECT_COLUMNS} FROM {table} WHERE {' AND '.join(where)} ORDER BY {order_sql} LIMIT %(limit)s OFFSET %(offset)s"
    return BuiltQuery(sql, params)
