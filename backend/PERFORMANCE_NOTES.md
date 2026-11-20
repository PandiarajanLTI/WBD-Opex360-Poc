# Snowflake-only performance changes

The frontend API paths and response shapes remain unchanged. Replace the listed backend files and keep the existing `routes.py`, schemas, requirements and UI.

## Existing schema used

- `TEMPLATE`: forecast rows and template-level aggregates
- `CURRENCYCONVERSION`: retained for currency calculations when business rules are enabled
- `COSTCENTER`: validation of active Company Code + Cost Center + Profit Center combinations
- `BUDGET_HOLDER`: budget-holder grid and bulk edits

No table, column, key or relationship is changed.

## Main improvements

1. A bounded LIFO pool reuses Snowflake sessions rather than authenticating per SQL statement.
2. Grid and budget endpoints use `COUNT(*) OVER()` so a page and its total normally require one query rather than two.
3. Save validation checks all dimension combinations in one SQL statement, removing the N+1 query pattern.
4. Updates are grouped by changed-column set and sent with `executemany`.
5. Grid queries select only the columns required by the existing UI.
6. SQL identifiers remain allow-listed and values remain parameterized.
7. The health endpoint now proves Snowflake connectivity.
8. Mock selection and mock fallback are removed.

## Important behavior

`POST /api/templates` cannot safely create an empty template because the supplied schema has no template-header table. The route is retained for UI compatibility and returns the existing 409 mapping with a clear message. Existing templates and complete row inserts continue to work.

## Recommended Snowflake operations without schema change

- Start with `SNOWFLAKE_POOL_SIZE=8`; keep it at or below the expected FastAPI worker concurrency per process.
- Use one FastAPI worker initially. With four workers and pool size 8, the maximum is 32 open Snowflake sessions.
- Set warehouse auto-suspend to 60 seconds and enable auto-resume.
- Use Query History filtered by query tag `wbd-opex360-fastapi` to compare p50 and p95 duration before and after.
- For a representative test, run 100 warm requests per endpoint at concurrency 8. Measure grid query, summary, save of 100 rows and budget update of 100 rows.
- If `TEMPLATE` is very large, use Snowflake Search Optimization Service only after Query Profile proves selective equality filters on `TEMPLATE_NAME` or `UNIQ_ID` dominate. This changes table optimization metadata, not the logical schema, but may increase cost.

## Verification

```bash
python -m pytest
python -m uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
```

The response must show `snowflake: connected`. Then call the existing UI endpoints. No frontend service URL or JSON contract needs to change.
