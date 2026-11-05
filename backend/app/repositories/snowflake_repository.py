from typing import Any
from app.core.config import Settings
from app.db.snowflake import SnowflakeConnectionFactory
from app.repositories.query_builder import (
    ALLOWED_COLUMNS,
    BUDGET_COLUMNS,
    BUDGET_UPDATE_COLUMNS,
    FORECAST_UPDATE_COLUMNS,
    build_filter_clauses,
    build_grid_query,
    build_order_clause,
)
from app.schemas.grid import GridQuery
class SnowflakeForecastRepository:
    def __init__(self, settings: Settings, factory: SnowflakeConnectionFactory): self.settings, self.factory = settings, factory
    def _fetch(self, sql: str, params: dict[str, Any]):
        with self.factory.connection() as connection:
            cursor = connection.cursor(); cursor.execute(sql, params); columns = [item[0] for item in cursor.description]; return [dict(zip(columns, row)) for row in cursor.fetchall()]
    def list_templates(self):
        table = self.settings.snowflake_summary_table; rows = self._fetch(f"SELECT TEMPLATE_NAME, SECTION, VERSION, STATUS, CURRENT_FORECAST, PRIOR_FORECAST, VARIANCE FROM {table}", {}); return [{"templateName":r["TEMPLATE_NAME"],"section":r["SECTION"],"version":r["VERSION"],"status":r["STATUS"],"currentForecast":r["CURRENT_FORECAST"],"priorForecast":r["PRIOR_FORECAST"],"variance":r["VARIANCE"]} for r in rows]
    def create_templates(self, templates):
        existing = {item["templateName"].casefold() for item in self.list_templates()}
        incoming_names = [item["templateName"].casefold() for item in templates]
        if len(set(incoming_names)) != len(incoming_names) or existing.intersection(incoming_names):
            raise ValueError("A template with this name already exists.")
        table = self.settings.snowflake_summary_table
        statement = (
            f"INSERT INTO {table} "
            "(TEMPLATE_NAME, SECTION, VERSION, STATUS, CURRENT_FORECAST, PRIOR_FORECAST, VARIANCE) "
            "VALUES (%(templateName)s, %(section)s, %(version)s, %(status)s, "
            "%(currentForecast)s, %(priorForecast)s, %(variance)s)"
        )
        with self.factory.connection() as connection:
            cursor = connection.cursor()
            for template in templates:
                cursor.execute(statement, template)
            connection.commit()
        return templates
    def metadata(self, template_name):
        item = next(x for x in self.list_templates() if x["templateName"] == template_name); return {"templateName":template_name,"version":item["version"],"status":item["status"],"kpis":{"Current forecast":item["currentForecast"],"Prior forecast":item["priorForecast"],"Variance":item["variance"]}}
    def query(self, template_name, request):
        built = build_grid_query(self.settings.snowflake_forecast_table, template_name, request)
        rows = self._fetch(built.sql, built.params)
        count_params: dict[str, Any] = {"template_name": template_name}
        filters = build_filter_clauses(
            request.filterModel, ALLOWED_COLUMNS, count_params
        )
        where = ["TEMPLATE_NAME = %(template_name)s", *filters]
        total = self._fetch(
            f"SELECT COUNT(*) AS TOTAL FROM {self.settings.snowflake_forecast_table} "
            f"WHERE {' AND '.join(where)}",
            count_params,
        )[0]["TOTAL"]
        return rows, total
    def summarize(self, template_name, request):
        group_columns = {"FSI_ACCOUNT", "GEOGRAPHY"}
        summary_columns = {
            "FSI_ACCOUNT", "GEOGRAPHY", "FY_WORKING_FORECAST", "ROW_COUNT"
        }
        params: dict[str, Any] = {
            "template_name": template_name,
            "limit": request.endRow - request.startRow,
            "offset": request.startRow,
        }
        filters = build_filter_clauses(
            request.filterModel, group_columns, params
        )
        where = ["TEMPLATE_NAME = %(template_name)s", *filters]
        order_sql = build_order_clause(
            request.sortModel, summary_columns, "FSI_ACCOUNT ASC, GEOGRAPHY ASC"
        )
        table = self.settings.snowflake_forecast_table
        grouped_query = (
            f"SELECT FSI_ACCOUNT, GEOGRAPHY, "
            f"SUM(COALESCE(FY_WORKING_FORECAST, 0)) AS FY_WORKING_FORECAST, "
            f"COUNT(*) AS ROW_COUNT FROM {table} "
            f"WHERE {' AND '.join(where)} "
            "GROUP BY FSI_ACCOUNT, GEOGRAPHY"
        )
        rows = self._fetch(
            f"{grouped_query} ORDER BY {order_sql} LIMIT %(limit)s OFFSET %(offset)s",
            params,
        )
        count_params = {
            key: value for key, value in params.items() if key.startswith("filter_")
        }
        total = self._fetch(
            f"SELECT COUNT(*) AS TOTAL FROM ({grouped_query}) AS grouped_rows",
            {**count_params, "template_name": template_name},
        )[0]["TOTAL"]
        return rows, total
    def save(self, template_name, rows):
        with self.factory.connection() as connection:
            cursor = connection.cursor()
            for row in rows:
                if row.get("INSERTED") == "Y" or int(row.get("UNIQ_ID", 0)) < 0:
                    fields = [
                        field for field in sorted(ALLOWED_COLUMNS - {"UNIQ_ID"})
                        if field in row
                    ]
                    columns = ", ".join(fields)
                    values = ", ".join(f"%({field})s" for field in fields)
                    cursor.execute(
                        f"INSERT INTO {self.settings.snowflake_forecast_table} "
                        f"({columns}) VALUES ({values})",
                        {
                            **{field: row[field] for field in fields},
                            "TEMPLATE_NAME": row.get("TEMPLATE_NAME", template_name),
                        },
                    )
                    continue
                fields = [field for field in FORECAST_UPDATE_COLUMNS if field in row]
                if not fields: continue
                assignments = ", ".join(f"{field} = %({field})s" for field in fields); params = {field:row[field] for field in fields}; params["uniq_id"] = row["UNIQ_ID"]; cursor.execute(f"UPDATE {self.settings.snowflake_forecast_table} SET {assignments} WHERE UNIQ_ID = %(uniq_id)s", params)
            connection.commit()
        return len(rows)
    def valid_combination(self, company_code, cost_center, profit_center):
        table=self.settings.snowflake_mapping_table; rows=self._fetch(f"SELECT COUNT(*) AS TOTAL FROM {table} WHERE COMPANY_CODE=%(company)s AND COST_CENTER=%(cost)s AND PROFIT_CENTER=%(profit)s AND COALESCE(CLOSED,'NO') != 'YES'", {"company":company_code,"cost":cost_center,"profit":profit_center}); return rows[0]["TOTAL"] > 0
    def budget_query(self, request):
        columns = ", ".join(BUDGET_COLUMNS)
        allowed_columns = set(BUDGET_COLUMNS)
        params = {
            "limit": request.endRow - request.startRow,
            "offset": request.startRow,
        }
        filters = build_filter_clauses(
            request.filterModel, allowed_columns, params
        )
        where_sql = f" WHERE {' AND '.join(filters)}" if filters else ""
        order_sql = build_order_clause(
            request.sortModel, allowed_columns, "COSTCENTER ASC"
        )
        table = self.settings.snowflake_budget_table
        rows = self._fetch(
            f"SELECT {columns} FROM {table}{where_sql} ORDER BY {order_sql} "
            "LIMIT %(limit)s OFFSET %(offset)s",
            params,
        )
        count_params = {key: value for key, value in params.items() if key.startswith("filter_")}
        total = self._fetch(
            f"SELECT COUNT(*) AS TOTAL FROM {table}{where_sql}", count_params
        )[0]["TOTAL"]
        return rows, total
    def budget_save(self, rows):
        with self.factory.connection() as connection:
            cursor = connection.cursor()
            for row in rows:
                fields = [field for field in BUDGET_UPDATE_COLUMNS if field in row]
                if not fields or not row.get("COSTCENTER"): continue
                assignments = ", ".join(f"{field} = %({field})s" for field in fields); params = {field:row[field] for field in fields}; params["costcenter"] = row["COSTCENTER"]; cursor.execute(f"UPDATE {self.settings.snowflake_budget_table} SET {assignments} WHERE COSTCENTER = %(costcenter)s", params)
            connection.commit()
        return len(rows)
