from typing import Any

from app.repositories.base import ForecastRepository

MANDATORY_FIELDS = (
    "TEMPLATE_NAME",
    "VERSION",
    "FSI_ACCOUNT",
    "GEOGRAPHY",
    "BRAND",
    "PROFIT_CENTER",
    "COMPANY_CODE",
    "COST_CENTER",
)


class ForecastService:
    def __init__(self, repository: ForecastRepository):
        self.repository = repository

    def _new(self, row):
        try:
            return row.get("UNIQ_ID") is None or int(row.get("UNIQ_ID")) <= 0
        except (TypeError, ValueError):
            return True

    def validate(self, rows):
        errors = []
        pending = []

        for row in rows:
            # Existing rows are updates and do not need dimension validation.
            if not self._new(row):
                continue

            missing = [field for field in MANDATORY_FIELDS if not row.get(field)]
            if missing:
                errors.append(
                    {
                        "rowId": row.get("UNIQ_ID"),
                        "message": "Missing required fields: " + ", ".join(missing),
                    }
                )
                continue

            key = (
                str(row["COMPANY_CODE"]),
                str(row["COST_CENTER"]),
                str(row["PROFIT_CENTER"]),
            )

            # Multiple forecast rows are allowed to use the same active
            # Company Code + Cost Center + Profit Center combination.
            # Keep every row in pending so an invalid combination is still
            # reported against every affected row.
            pending.append((row, key))

        # The repository already de-duplicates lookup keys before querying
        # Snowflake, so repeated dimensions do not create extra DB lookups.
        valid = self.repository.valid_combinations([key for _, key in pending]) if pending else set()

        for row, key in pending:
            if key not in valid:
                errors.append(
                    {
                        "rowId": row.get("UNIQ_ID"),
                        "message": "Invalid or inactive dimension combination",
                    }
                )

        return errors

    def save(self, template_name, rows):
        errors = self.validate(rows)
        if errors:
            return {
                "requested": len(rows),
                "updated": 0,
                "inserted": 0,
                "saved": 0,
                "errors": errors,
                "message": "Validation failed",
            }

        result = self.repository.save(template_name, rows)
        return {
            **result,
            "saved": result["updated"] + result["inserted"],
            "errors": [],
            "message": (
                f"Updated {result['updated']} row(s); "
                f"inserted {result['inserted']} row(s)."
            ),
        }
