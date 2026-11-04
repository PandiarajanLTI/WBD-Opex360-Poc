from copy import deepcopy
from typing import Any
from app.schemas.grid import GridQuery
from app.repositories.query_builder import ALLOWED_COLUMNS, matches_filter_model, sort_rows
BUDGET_EDITABLE_COLUMNS = {"FUNCTION","SUBFUNCTION","COE_TEAM","COE_SUB_TEAM","COE_POC","BU_POC","BUDGET_HOLDER","REGION","LOCATION","CITY","CUSTOM_1","CUSTOM_2","CUSTOM_3"}
class MockForecastRepository:
    def __init__(self):
        self.budget_overrides: dict[str, dict[str, Any]] = {}
        self.rows = [self._row(i, "Warner Media") for i in range(1, 351)] + [self._row(i + 1000, "EMEA Distribution") for i in range(1, 151)]
        self.templates = [
            {"templateName":"Warner Media","section":"Forecast","version":"10+2","status":"Working","currentForecast":2450000,"priorForecast":2380000,"variance":70000},
            {"templateName":"EMEA Distribution","section":"Forecast","version":"10+2","status":"Working","currentForecast":1120000,"priorForecast":1090000,"variance":30000},
        ]
    @staticmethod
    def _row(index: int, template: str) -> dict[str, Any]:
        amount = 1000 + index * 7
        return {"UNIQ_ID": index, "TEMPLATE_NAME": template, "VERSION": "10+2", "COMPANY_CODE": "US01", "PROFIT_CENTER": f"P{index % 8:03}", "COST_CENTER": f"C{index % 25:03}", "FSI_ACCOUNT": f"A{index % 12:03}", "GEOGRAPHY": "NA" if index % 2 else "EMEA", "BRAND": "Studio", "NOTES": "", **{f"{month}_FORECAST": amount for month in ("JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC")}, "FY_WORKING_FORECAST": amount * 12}
    def list_templates(self):
        return deepcopy(self.templates)
    def create_templates(self, templates):
        existing = {item["templateName"].casefold() for item in self.templates}
        incoming_names = [item["templateName"].casefold() for item in templates]
        if len(set(incoming_names)) != len(incoming_names) or existing.intersection(incoming_names):
            raise ValueError("A template with this name already exists.")
        self.templates.extend(deepcopy(templates))
        return deepcopy(templates)
    def metadata(self, template_name):
        item = next((x for x in self.list_templates() if x["templateName"] == template_name), self.list_templates()[0]); return {"templateName": template_name, "version": item["version"], "status": item["status"], "kpis": {"Current forecast": item["currentForecast"], "Prior forecast": item["priorForecast"], "Variance": item["variance"]}}
    def query(self, template_name, request: GridQuery):
        rows = [r for r in self.rows if r["TEMPLATE_NAME"] == template_name]
        rows = [row for row in rows if matches_filter_model(row, request.filterModel, ALLOWED_COLUMNS)]
        sort_rows(rows, request.sortModel, ALLOWED_COLUMNS)
        return deepcopy(rows[request.startRow:request.endRow]), len(rows)
    def summarize(self, template_name, request: GridQuery):
        source_rows = [r for r in self.rows if r["TEMPLATE_NAME"] == template_name]
        source_rows = [
            row for row in source_rows
            if matches_filter_model(row, request.filterModel, ALLOWED_COLUMNS)
        ]
        grouped = {}
        for row in source_rows:
            key = (row.get("FSI_ACCOUNT"), row.get("GEOGRAPHY"))
            summary = grouped.setdefault(
                key,
                {
                    "FSI_ACCOUNT": key[0],
                    "GEOGRAPHY": key[1],
                    "FY_WORKING_FORECAST": 0,
                    "ROW_COUNT": 0,
                },
            )
            summary["FY_WORKING_FORECAST"] += float(row.get("FY_WORKING_FORECAST") or 0)
            summary["ROW_COUNT"] += 1
        rows = list(grouped.values())
        summary_columns = {
            "FSI_ACCOUNT", "GEOGRAPHY", "FY_WORKING_FORECAST", "ROW_COUNT"
        }
        sort_rows(rows, request.sortModel, summary_columns)
        return deepcopy(rows[request.startRow:request.endRow]), len(rows)
    def save(self, template_name, rows):
        for incoming in rows:
            stored = {key: value for key, value in incoming.items() if key != "INSERTED"}
            found = next((r for r in self.rows if r["UNIQ_ID"] == incoming.get("UNIQ_ID")), None)
            if found: found.update(stored)
            else: stored["UNIQ_ID"] = max(r["UNIQ_ID"] for r in self.rows) + 1; stored["TEMPLATE_NAME"] = template_name; self.rows.append(stored)
        return len(rows)
    def valid_combination(self, company_code, cost_center, profit_center): return bool(company_code and cost_center and profit_center)
    def budget_query(self, request):
        rows = [{"COSTCENTER":f"C{i:03}","COSTCENTER_NAME":f"Cost Center {i}","COMPANY_CODE":"US01","PROFIT_CENTER":f"P{i%8:03}","FUNCTION":"Technology","SUBFUNCTION":"Engineering","BUDGET_HOLDER":"POC User","REGION":"Americas","LOCATION":"New York","CITY":"New York"} for i in range(1, 101)]
        # User-modified values win over the freshly loaded source data.
        rows = [{**row, **self.budget_overrides.get(row["COSTCENTER"], {})} for row in rows]
        allowed = set(rows[0]) if rows else set()
        rows = [row for row in rows if matches_filter_model(row, request.filterModel, allowed)]
        sort_rows(rows, request.sortModel, allowed)
        return rows[request.startRow:request.endRow], len(rows)
    def budget_save(self, rows):
        for incoming in rows:
            key = incoming.get("COSTCENTER")
            if not key: continue
            changes = {k: v for k, v in incoming.items() if k in BUDGET_EDITABLE_COLUMNS}
            self.budget_overrides.setdefault(key, {}).update(changes)
        return len(rows)