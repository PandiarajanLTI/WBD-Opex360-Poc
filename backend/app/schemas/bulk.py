import math
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Same set as FORECAST_EDITABLE in snowflake_repository.py - the only columns the UI can edit.
BulkField = Literal["NOV_FORECAST", "DEC_FORECAST", "NOTES"]
NUMERIC_FIELDS = frozenset({"NOV_FORECAST", "DEC_FORECAST"})


class BulkFieldUpdate(BaseModel):
    """PATCH /api/templates/{template_name}/rows/bulk-update

    Sets ONE editable field to ONE value on every row of the template, in a single request.
    """

    model_config = ConfigDict(extra="forbid")

    field: BulkField
    value: Any = Field(description="A number for NOV_FORECAST / DEC_FORECAST, text for NOTES.")

    @model_validator(mode="after")
    def check_value(self):
        value = self.value
        if self.field in NUMERIC_FIELDS:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{self.field} must be a number")
        elif not isinstance(value, str):
            raise ValueError("NOTES must be text")
        return self

    def ensure_finite(self) -> None:
        """Reject NaN / Infinity (the route turns this into a 422).

        Deliberately not a validator: FastAPI echoes the offending input inside its own
        validation-error body, and a NaN there cannot be serialised, which would turn this
        422 into an HTTP 500.
        """
        if self.field in NUMERIC_FIELDS and not math.isfinite(self.value):
            raise ValueError(f"{self.field} must be a finite number")
