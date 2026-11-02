from typing import Any
from app.repositories.base import ForecastRepository
MANDATORY_FIELDS = ("TEMPLATE_NAME","VERSION","FSI_ACCOUNT","GEOGRAPHY","BRAND","PROFIT_CENTER","COMPANY_CODE","COST_CENTER")
class ForecastService:
    def __init__(self, repository: ForecastRepository): self.repository = repository
    def validate(self, rows: list[dict[str, Any]]):
        errors = []
        seen = set()
        for row in rows:
            missing = [field for field in MANDATORY_FIELDS if not row.get(field)]
            key = (row.get("COMPANY_CODE"), row.get("COST_CENTER"), row.get("PROFIT_CENTER"))
            if missing: errors.append({"rowId":row.get("UNIQ_ID"),"message":f"Missing required fields: {', '.join(missing)}"})
            elif key in seen or not self.repository.valid_combination(*key): errors.append({"rowId":row.get("UNIQ_ID"),"message":"Invalid or duplicate dimension combination"})
            seen.add(key)
        return errors
    def save(self, template_name, rows):
        errors = self.validate(rows)
        if errors: return {"saved":0,"errors":errors,"message":"Validation failed"}
        saved = self.repository.save(template_name, rows); return {"saved":saved,"errors":[],"message":f"Saved {saved} row(s)."}
