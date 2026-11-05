from typing import Any

from app.repositories.base import ForecastRepository, DimensionKey


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

    def _is_new_row(self, row: dict[str, Any]) -> bool:
        """
        New rows require dimension validation.
        Existing Snowflake rows skip dimension validation.
        """
        if str(row.get("INSERTED", "")).upper() == "Y":
            return True

        uniq_id = row.get("UNIQ_ID")

        if uniq_id is None:
            return True

        try:
            return int(uniq_id) <= 0
        except (TypeError, ValueError):
            return True

    def validate(self, rows: list[dict[str, Any]]):
        errors = []

        seen: set[DimensionKey] = set()
        candidates: list[DimensionKey] = []
        new_rows_with_keys = []

        for row in rows:

            # -----------------------------------------
            # EXISTING ROW
            # -----------------------------------------
            if not self._is_new_row(row):

                # Existing record:
                # Skip dimension validation.
                continue

            # -----------------------------------------
            # NEW ROW
            # -----------------------------------------

            missing = [
                field
                for field in MANDATORY_FIELDS
                if not row.get(field)
            ]

            if missing:
                errors.append(
                    {
                        "rowId": row.get("UNIQ_ID"),
                        "message": (
                            "Missing required fields: "
                            + ", ".join(missing)
                        ),
                    }
                )
                continue

            key: DimensionKey = (
                str(row.get("COMPANY_CODE") or ""),
                str(row.get("COST_CENTER") or ""),
                str(row.get("PROFIT_CENTER") or ""),
            )

            if key in seen:
                errors.append(
                    {
                        "rowId": row.get("UNIQ_ID"),
                        "message": (
                            "Duplicate dimension combination "
                            "in request"
                        ),
                    }
                )
                continue

            seen.add(key)
            candidates.append(key)
            new_rows_with_keys.append((row, key))

        # -----------------------------------------
        # ONE Snowflake validation query
        # only for NEW rows
        # -----------------------------------------

        if candidates:

            valid_combinations = (
                self.repository.valid_combinations(candidates)
            )

            for row, key in new_rows_with_keys:

                if key not in valid_combinations:

                    errors.append(
                        {
                            "rowId": row.get("UNIQ_ID"),
                            "message": (
                                "Invalid or inactive "
                                "Company Code + Cost Center + "
                                "Profit Center combination"
                            ),
                        }
                    )

        return errors

    def save(
        self,
        template_name: str,
        rows: list[dict[str, Any]],
    ):

        errors = self.validate(rows)

        if errors:
            return {
                "saved": 0,
                "errors": errors,
                "message": "Validation failed",
            }

        saved = self.repository.save(
            template_name,
            rows,
        )

        return {
            "saved": saved,
            "errors": [],
            "message": f"Saved {saved} row(s).",
        }