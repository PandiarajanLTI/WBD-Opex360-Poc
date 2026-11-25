"""SQL for "set one editable field on every row of a template" (bulk update all).

One UPDATE replaces the old flow (download every row, then POST them back to rows/save in
batches of 300). It keeps the rules of SnowflakeForecastRepository.save/_bulk_update:

* only rows of the requested template are touched (TEMPLATE_NAME is always in the WHERE),
* NOV/DEC also write their *_PRATE column = forecast * FX_RATES, with the same FX lookup as
  _prate_fx_rates (CURREP = rate type, YEARS = rate year, MAX(FX_RATES) per upper-cased currency),
* UPDATED_TS / UPDATED_BY / USER_ACTION are stamped exactly as save does.

A row whose CURRENCY is blank, or has no FX rate, cannot get a PRATE value. Such a row is SKIPPED
(forecast and PRATE stay consistent) and reported, instead of blocking every other row. NOTES
does not need an FX rate, so every row is updated.

Column names come from a fixed allow-list; every value is a bound parameter.
"""
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

PRATE_COLUMNS = {"NOV_FORECAST": "NOV_FORECAST_PRATE", "DEC_FORECAST": "DEC_FORECAST_PRATE"}
BULK_FIELDS = ("NOV_FORECAST", "DEC_FORECAST", "NOTES")
AUDIT_ASSIGNMENTS = "UPDATED_TS=CURRENT_TIMESTAMP(),UPDATED_BY='OPEX360_API',USER_ACTION='UPDATE'"
MAX_REASON_GROUPS = 5
MAX_SKIPPED_IDS = 5


@dataclass
class BulkStatements:
    update_sql: str
    update_params: dict[str, Any]
    # NOV/DEC only: rows the UPDATE will skip because they have no usable FX rate.
    # skipped_sql -> (currency, row_count, total_skipped) per currency, largest first.
    # sample_sql  -> (UNIQ_ID,) of the first few skipped rows, so they can be found and fixed.
    skipped_sql: str | None = None
    sample_sql: str | None = None
    skipped_params: dict[str, Any] = field(default_factory=dict)


def _fx_rates_sql(currency_table: str) -> str:
    return (
        "SELECT UPPER(TRIM(CURRENCY)) CURRENCY,MAX(FX_RATES) FX_RATES "
        f"FROM {currency_table} WHERE CURREP=%(rate_type)s AND YEARS=%(rate_year)s "
        "GROUP BY UPPER(TRIM(CURRENCY))"
    )


def build_bulk_update(
    forecast_table: str,
    currency_table: str,
    template_name: str,
    field_name: str,
    value: Any,
    rate_type: Any,
    rate_year: Any,
) -> BulkStatements:
    if field_name not in BULK_FIELDS:
        raise ValueError(f"Unsupported bulk update field: {field_name}")
    if field_name == "NOTES":
        return BulkStatements(
            update_sql=(
                f"UPDATE {forecast_table} SET NOTES=%(value)s,{AUDIT_ASSIGNMENTS} "
                "WHERE TEMPLATE_NAME=%(template_name)s"
            ),
            update_params={"value": value, "template_name": template_name},
        )
    prate = PRATE_COLUMNS[field_name]
    fx_sql = _fx_rates_sql(currency_table)
    fx_params = {"rate_type": rate_type, "rate_year": rate_year}
    unpriced = (
        f"FROM {forecast_table} t LEFT JOIN ({fx_sql}) fx "
        "ON UPPER(TRIM(t.CURRENCY))=fx.CURRENCY "
        "WHERE t.TEMPLATE_NAME=%(template_name)s AND fx.CURRENCY IS NULL"
    )
    return BulkStatements(
        update_sql=(
            f"UPDATE {forecast_table} t SET {field_name}=%(value)s,"
            f"{prate}=%(value)s*fx.FX_RATES,{AUDIT_ASSIGNMENTS} "
            f"FROM ({fx_sql}) fx "
            "WHERE t.TEMPLATE_NAME=%(template_name)s AND UPPER(TRIM(t.CURRENCY))=fx.CURRENCY"
        ),
        update_params={
            "value": Decimal(str(value)),
            "template_name": template_name,
            **fx_params,
        },
        skipped_sql=(
            "SELECT COALESCE(UPPER(TRIM(t.CURRENCY)),'') CURRENCY,COUNT(*) N,"
            f"SUM(COUNT(*)) OVER () TOTAL {unpriced} "
            "GROUP BY COALESCE(UPPER(TRIM(t.CURRENCY)),'') ORDER BY N DESC "
            f"LIMIT {MAX_REASON_GROUPS + 1}"
        ),
        sample_sql=f"SELECT t.UNIQ_ID {unpriced} ORDER BY t.UNIQ_ID LIMIT {MAX_SKIPPED_IDS}",
        skipped_params={"template_name": template_name, **fx_params},
    )


def summarize_skipped(rows) -> tuple[int, list[str]]:
    """(total skipped rows, readable reasons) from the skipped_sql result."""
    rows = list(rows)
    if not rows:
        return 0, []
    total = int(rows[0][2])
    reasons = []
    for currency, count, _ in rows[:MAX_REASON_GROUPS]:
        if not str(currency or "").strip():
            reasons.append(f"{count} row(s) have no CURRENCY")
        else:
            reasons.append(f"{count} row(s) use currency {currency}, which has no PRATE FX rate")
    if len(rows) > MAX_REASON_GROUPS:
        reasons.append("more rows use other currencies without a PRATE FX rate")
    return total, reasons
