from typing import Any
from app.repositories.base import ForecastRepository, DimensionKey

MANDATORY_FIELDS = ("TEMPLATE_NAME", "VERSION", "FSI_ACCOUNT", "GEOGRAPHY", "BRAND", "PROFIT_CENTER", "COMPANY_CODE", "COST_CENTER")


class ForecastService:
    def __init__(self, repository: ForecastRepository):
        self.repository = repository

    def validate(self, rows: list[dict[str, Any]]):
        errors = []
        seen: set[DimensionKey] = set()
        candidates: list[DimensionKey] = []
        row_keys = []
        for row in rows:
            missing = [field for field in MANDATORY_FIELDS if not row.get(field)]
            key = (str(row.get("COMPANY_CODE") or ""), str(row.get("COST_CENTER") or ""), str(row.get("PROFIT_CENTER") or ""))
            row_keys.append(key)
            if missing:
                errors.append({"rowId": row.get("UNIQ_ID"), "message": f"Missing required fields: {', '.join(missing)}"})
            elif key in seen:
                errors.append({"rowId": row.get("UNIQ_ID"), "message": "Duplicate dimension combination in request"})
            else:
                candidates.append(key)
            seen.add(key)

        # One Snowflake lookup for the whole payload instead of one query per row.
        valid = self.repository.valid_combinations(candidates) if candidates else set()
        existing_error_ids = {error["rowId"] for error in errors}
        for row, key in zip(rows, row_keys):
            if row.get("UNIQ_ID") not in existing_error_ids and key not in valid:
                errors.append({"rowId": row.get("UNIQ_ID"), "message": "Invalid or inactive Company Code + Cost Center + Profit Center combination"})
        return errors

    def save(self, template_name: str, rows: list[dict[str, Any]]):
        errors = self.validate(rows)
        if errors:
            return {"saved": 0, "errors": errors, "message": "Validation failed"}
        saved = self.repository.save(template_name, rows)
        return {"saved": saved, "errors": [], "message": f"Saved {saved} row(s)."}
