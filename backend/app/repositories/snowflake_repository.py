from typing import Any
from app.core.config import Settings
from app.db.snowflake import SnowflakeConnectionFactory
from app.repositories.query_builder import ALLOWED_COLUMNS, build_grid_query
from app.schemas.grid import GridQuery
class SnowflakeForecastRepository:
    def __init__(self, settings: Settings, factory: SnowflakeConnectionFactory): self.settings, self.factory = settings, factory
    def _fetch(self, sql: str, params: dict[str, Any]):
        with self.factory.connection() as connection:
            cursor = connection.cursor(); cursor.execute(sql, params); columns = [item[0] for item in cursor.description]; return [dict(zip(columns, row)) for row in cursor.fetchall()]
    def list_templates(self):
        table = self.settings.snowflake_summary_table; rows = self._fetch(f"SELECT TEMPLATE_NAME, SECTION, VERSION, STATUS, CURRENT_FORECAST, PRIOR_FORECAST, VARIANCE FROM {table}", {}); return [{"templateName":r["TEMPLATE_NAME"],"section":r["SECTION"],"version":r["VERSION"],"status":r["STATUS"],"currentForecast":r["CURRENT_FORECAST"],"priorForecast":r["PRIOR_FORECAST"],"variance":r["VARIANCE"]} for r in rows]
    def metadata(self, template_name):
        item = next(x for x in self.list_templates() if x["templateName"] == template_name); return {"templateName":template_name,"version":item["version"],"status":item["status"],"kpis":{"Current forecast":item["currentForecast"],"Prior forecast":item["priorForecast"],"Variance":item["variance"]}}
    def query(self, template_name, request):
        built = build_grid_query(self.settings.snowflake_forecast_table, template_name, request); rows = self._fetch(built.sql, built.params); total = self._fetch(f"SELECT COUNT(*) AS TOTAL FROM {self.settings.snowflake_forecast_table} WHERE TEMPLATE_NAME = %(template_name)s", {"template_name":template_name})[0]["TOTAL"]; return rows, total
    def save(self, template_name, rows):
        editable = {"NOV_FORECAST","DEC_FORECAST","NOTES"}
        with self.factory.connection() as connection:
            cursor = connection.cursor()
            for row in rows:
                fields = [field for field in editable if field in row]
                if not fields: continue
                assignments = ", ".join(f"{field} = %({field})s" for field in fields); params = {field:row[field] for field in fields}; params["uniq_id"] = row["UNIQ_ID"]; cursor.execute(f"UPDATE {self.settings.snowflake_forecast_table} SET {assignments} WHERE UNIQ_ID = %(uniq_id)s", params)
            connection.commit()
        return len(rows)
    def valid_combination(self, company_code, cost_center, profit_center):
        table=self.settings.snowflake_mapping_table; rows=self._fetch(f"SELECT COUNT(*) AS TOTAL FROM {table} WHERE COMPANY_CODE=%(company)s AND COST_CENTER=%(cost)s AND PROFIT_CENTER=%(profit)s AND COALESCE(CLOSED,'NO') != 'YES'", {"company":company_code,"cost":cost_center,"profit":profit_center}); return rows[0]["TOTAL"] > 0
    def budget_query(self, request):
        columns="COSTCENTER, COSTCENTER_NAME, COMPANY_CODE, PROFIT_CENTER, FUNCTION, SUBFUNCTION, BUDGET_HOLDER, REGION, LOCATION, CITY"; rows=self._fetch(f"SELECT {columns} FROM {self.settings.snowflake_budget_table} LIMIT %(limit)s OFFSET %(offset)s", {"limit":request.endRow-request.startRow,"offset":request.startRow}); total=self._fetch(f"SELECT COUNT(*) AS TOTAL FROM {self.settings.snowflake_budget_table}", {})[0]["TOTAL"]; return rows,total
    def budget_save(self, rows):
        editable = {"FUNCTION","SUBFUNCTION","COE_TEAM","COE_SUB_TEAM","COE_POC","BU_POC","BUDGET_HOLDER","REGION","LOCATION","CITY","CUSTOM_1","CUSTOM_2","CUSTOM_3"}
        with self.factory.connection() as connection:
            cursor = connection.cursor()
            for row in rows:
                fields = [field for field in editable if field in row]
                if not fields or not row.get("COSTCENTER"): continue
                assignments = ", ".join(f"{field} = %({field})s" for field in fields); params = {field:row[field] for field in fields}; params["costcenter"] = row["COSTCENTER"]; cursor.execute(f"UPDATE {self.settings.snowflake_budget_table} SET {assignments} WHERE COSTCENTER = %(costcenter)s", params)
            connection.commit()
        return len(rows)
