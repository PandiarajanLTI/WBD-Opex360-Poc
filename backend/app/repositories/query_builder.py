from dataclasses import dataclass
from typing import Any
from app.schemas.grid import GridQuery
@dataclass
class BuiltQuery:
    sql: str
    params: dict[str, Any]
ALLOWED_COLUMNS = {"UNIQ_ID","TEMPLATE_NAME","VERSION","COMPANY_CODE","PROFIT_CENTER","COST_CENTER","FSI_ACCOUNT","GEOGRAPHY","BRAND","NOTES","JAN_FORECAST","FEB_FORECAST","MAR_FORECAST","APR_FORECAST","MAY_FORECAST","JUN_FORECAST","JUL_FORECAST","AUG_FORECAST","SEP_FORECAST","OCT_FORECAST","NOV_FORECAST","DEC_FORECAST","FY_WORKING_FORECAST"}
SELECT_COLUMNS = ", ".join(sorted(ALLOWED_COLUMNS))
def build_grid_query(table: str, template_name: str, request: GridQuery) -> BuiltQuery:
    where = ["TEMPLATE_NAME = %(template_name)s"]
    params: dict[str, Any] = {"template_name": template_name, "limit": request.endRow - request.startRow, "offset": request.startRow}
    for index, (column, model) in enumerate(request.filterModel.items()):
        if column not in ALLOWED_COLUMNS: continue
        value = model.get("filter")
        if value is not None:
            key = f"filter_{index}"; where.append(f"{column} ILIKE %({key})s"); params[key] = f"%{value}%"
    order = []
    for item in request.sortModel:
        if item.colId in ALLOWED_COLUMNS: order.append(f"{item.colId} {item.sort.upper()}")
    order_sql = ", ".join(order) if order else "UNIQ_ID ASC"
    sql = f"SELECT {SELECT_COLUMNS} FROM {table} WHERE {' AND '.join(where)} ORDER BY {order_sql} LIMIT %(limit)s OFFSET %(offset)s"
    return BuiltQuery(sql, params)
