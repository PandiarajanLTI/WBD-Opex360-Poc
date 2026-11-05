from collections import defaultdict
from typing import Any, Iterable
from app.core.config import Settings
from app.db.snowflake import SnowflakeConnectionFactory
from app.repositories.base import DimensionKey
from app.repositories.query_builder import (
    ALLOWED_COLUMNS, COLUMN_GROUPS, DEFAULT_COLUMNS, TEMPLATE_COLUMNS,
    build_filter_clauses, build_grid_query, build_order_clause,
)

BUDGET_COLUMNS = {"COSTCENTER", "COSTCENTER_NAME", "COMPANY_CODE", "PROFIT_CENTER", "FUNCTION", "SUBFUNCTION", "COE_TEAM", "COE_SUB_TEAM", "COE_POC", "BU_POC", "BUDGET_HOLDER", "REGION", "LOCATION", "CITY", "CUSTOM_1", "CUSTOM_2", "CUSTOM_3"}
BUDGET_EDITABLE = BUDGET_COLUMNS - {"COSTCENTER", "COSTCENTER_NAME", "COMPANY_CODE", "PROFIT_CENTER"}
FORECAST_EDITABLE = {"NOV_FORECAST", "DEC_FORECAST", "NOTES", "COMMENT"}


class SnowflakeForecastRepository:
    def __init__(self, settings: Settings, factory: SnowflakeConnectionFactory):
        self.settings, self.factory = settings, factory

    def _fetch(self, sql: str, params: dict[str, Any]):
        with self.factory.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, params)
                columns = [item[0] for item in cursor.description]
                return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def list_templates(self):
        table = self.settings.snowflake_forecast_table
        rows = self._fetch(f"""SELECT TEMPLATE_NAME, MAX(SECTION) SECTION, MAX(VERSION) VERSION, MAX(STATUS) STATUS,
            SUM(COALESCE(FY_WORKING_FORECAST,0)) CURRENT_FORECAST,
            SUM(COALESCE(FY_PRIORFORECAST,0)) PRIOR_FORECAST,
            SUM(COALESCE(VARIANCE_PRIORFORECAST,0)) VARIANCE
            FROM {table} GROUP BY TEMPLATE_NAME ORDER BY TEMPLATE_NAME""", {})
        return [{"templateName": r["TEMPLATE_NAME"], "section": r["SECTION"], "version": r["VERSION"], "status": r["STATUS"], "currentForecast": r["CURRENT_FORECAST"], "priorForecast": r["PRIOR_FORECAST"], "variance": r["VARIANCE"]} for r in rows]

    def create_templates(self, templates):
        # Keeps the API contract, but the unchanged TEMPLATE schema represents rows, not a separate template header.
        raise ValueError("Creating an empty template is not supported by the existing four-table schema. Insert the first complete Template row instead.")

    def metadata(self, template_name):
        table = self.settings.snowflake_forecast_table
        rows = self._fetch(f"""SELECT TEMPLATE_NAME, MAX(VERSION) VERSION, MAX(STATUS) STATUS,
            SUM(COALESCE(FY_WORKING_FORECAST,0)) CURRENT_FORECAST,
            SUM(COALESCE(FY_PRIORFORECAST,0)) PRIOR_FORECAST,
            SUM(COALESCE(VARIANCE_PRIORFORECAST,0)) VARIANCE
            FROM {table} WHERE TEMPLATE_NAME=%(name)s GROUP BY TEMPLATE_NAME""", {"name": template_name})
        if not rows: raise ValueError(f"Unknown template: {template_name}")
        r=rows[0]
        return {"templateName": template_name, "version": r["VERSION"], "status": r["STATUS"], "kpis": {"Current forecast": r["CURRENT_FORECAST"], "Prior forecast": r["PRIOR_FORECAST"], "Variance": r["VARIANCE"]}, "columns": TEMPLATE_COLUMNS, "defaultColumns": DEFAULT_COLUMNS, "columnGroups": COLUMN_GROUPS, "editableColumns": sorted(FORECAST_EDITABLE)}

    def query(self, template_name, request):
        built = build_grid_query(self.settings.snowflake_forecast_table, template_name, request)
        rows = self._fetch(built.sql, built.params)
        total = int(rows[0].pop("__TOTAL_COUNT")) if rows else 0
        for row in rows: row.pop("__TOTAL_COUNT", None)
        return rows, total

    def summarize(self, template_name, request):
        params={"template_name": template_name, "limit": request.endRow-request.startRow, "offset": request.startRow}
        filters=build_filter_clauses(request.filterModel, {"FSI_ACCOUNT","GEOGRAPHY"}, params)
        where=["TEMPLATE_NAME=%(template_name)s", *filters]
        order=build_order_clause(request.sortModel, {"FSI_ACCOUNT","GEOGRAPHY","FY_WORKING_FORECAST","ROW_COUNT"}, "FSI_ACCOUNT, GEOGRAPHY")
        sql=f"""SELECT FSI_ACCOUNT, GEOGRAPHY, SUM(COALESCE(FY_WORKING_FORECAST,0)) FY_WORKING_FORECAST,
            COUNT(*) ROW_COUNT, COUNT(*) OVER() __TOTAL_COUNT
            FROM {self.settings.snowflake_forecast_table} WHERE {' AND '.join(where)}
            GROUP BY FSI_ACCOUNT, GEOGRAPHY ORDER BY {order} LIMIT %(limit)s OFFSET %(offset)s"""
        rows=self._fetch(sql, params)
        total=int(rows[0].pop("__TOTAL_COUNT")) if rows else 0
        for row in rows: row.pop("__TOTAL_COUNT", None)
        return rows,total

    def valid_combinations(self, keys: Iterable[DimensionKey]) -> set[DimensionKey]:
        unique=list(dict.fromkeys(keys))
        if not unique: return set()
        params={}
        tuples=[]
        for i,(company,cost,profit) in enumerate(unique):
            params.update({f"c{i}":company,f"cc{i}":cost,f"p{i}":profit})
            tuples.append(f"(%(c{i})s,%(cc{i})s,%(p{i})s)")
        sql=f"""SELECT COMPANY_CODE, COSTCENTER, PROFIT_CENTER FROM {self.settings.snowflake_cost_center_table}
            WHERE IS_ACTIVE='Y' AND (COMPANY_CODE,COSTCENTER,PROFIT_CENTER) IN ({','.join(tuples)})"""
        return {(str(r["COMPANY_CODE"]),str(r["COSTCENTER"]),str(r["PROFIT_CENTER"])) for r in self._fetch(sql,params)}

    def save(self, template_name, rows):
        inserts=[]
        update_groups=defaultdict(list)
        for row in rows:
            if row.get("INSERTED") == "Y" or int(row.get("UNIQ_ID",0)) < 0:
                fields=tuple(field for field in TEMPLATE_COLUMNS if field != "UNIQ_ID" and (field in row or field == "TEMPLATE_NAME"))
                inserts.append((fields,{**row,"TEMPLATE_NAME":row.get("TEMPLATE_NAME",template_name)}))
            else:
                fields=tuple(sorted(field for field in FORECAST_EDITABLE if field in row))
                if fields: update_groups[fields].append(row)
        with self.factory.connection() as connection:
            with connection.cursor() as cursor:
                for fields,row in inserts:
                    cursor.execute(f"INSERT INTO {self.settings.snowflake_forecast_table} ({','.join(fields)}) VALUES ({','.join(f'%({f})s' for f in fields)})", {f:row.get(f) for f in fields})
                for fields,group in update_groups.items():
                    stmt=f"UPDATE {self.settings.snowflake_forecast_table} SET {','.join(f'{f}=%({f})s' for f in fields)} WHERE UNIQ_ID=%(UNIQ_ID)s AND TEMPLATE_NAME=%(TEMPLATE_NAME)s"
                    cursor.executemany(stmt,[{**{f:r.get(f) for f in fields},"UNIQ_ID":r["UNIQ_ID"],"TEMPLATE_NAME":template_name} for r in group])
            connection.commit()
        return len(rows)

    def budget_query(self, request):
        columns=sorted(BUDGET_COLUMNS)
        params={"limit":request.endRow-request.startRow,"offset":request.startRow}
        filters=build_filter_clauses(request.filterModel,set(columns),params)
        where=f" WHERE {' AND '.join(filters)}" if filters else ""
        order=build_order_clause(request.sortModel,set(columns),"COSTCENTER ASC")
        rows=self._fetch(f"SELECT {','.join(columns)}, COUNT(*) OVER() __TOTAL_COUNT FROM {self.settings.snowflake_budget_table}{where} ORDER BY {order} LIMIT %(limit)s OFFSET %(offset)s",params)
        total=int(rows[0].pop("__TOTAL_COUNT")) if rows else 0
        for row in rows: row.pop("__TOTAL_COUNT",None)
        return rows,total

    def budget_save(self, rows):
        groups=defaultdict(list)
        for row in rows:
            fields=tuple(sorted(f for f in BUDGET_EDITABLE if f in row))
            if fields and row.get("COSTCENTER"): groups[fields].append(row)
        with self.factory.connection() as connection:
            with connection.cursor() as cursor:
                for fields,group in groups.items():
                    stmt=f"UPDATE {self.settings.snowflake_budget_table} SET {','.join(f'{f}=%({f})s' for f in fields)} WHERE COSTCENTER=%(COSTCENTER)s"
                    cursor.executemany(stmt,[{**{f:r.get(f) for f in fields},"COSTCENTER":r["COSTCENTER"]} for r in group])
            connection.commit()
        return len(rows)
