# WBD Opex360 AG Grid POC

Working React + FastAPI POC derived from the attached functional requirements and schema workbook.

## Quick start

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

`DATA_REPOSITORY=mock` runs without Snowflake. Swagger: `http://localhost:8000/docs`.

The root `.gitignore` excludes installed dependencies, virtual environments, build and test
output, local environment files, and editor settings. Commit source, tests, dependency
manifests and lockfiles, documentation, and `.env.example` templates; keep real credentials
in ignored local environment files.

### Snowflake connection

The backend already supports Snowflake. Keep `DATA_REPOSITORY=mock` until the
cross team confirms access and the required database objects.

Configure the following values in `backend/.env`, using
[`backend/.env.example`](backend/.env.example) as the template:

```dotenv
DATA_REPOSITORY=snowflake

SNOWFLAKE_ACCOUNT=<account-identifier>
SNOWFLAKE_USER=<username>
SNOWFLAKE_PASSWORD=<password>
SNOWFLAKE_WAREHOUSE=<warehouse>
SNOWFLAKE_DATABASE=<database>
SNOWFLAKE_SCHEMA=<schema>
SNOWFLAKE_ROLE=<role>

SNOWFLAKE_FORECAST_TABLE=FORECAST_TEMPLATE
SNOWFLAKE_BUDGET_TABLE=BUDGET_TABLE
SNOWFLAKE_MAPPING_TABLE=DIMENSION_MAPPING
SNOWFLAKE_SUMMARY_TABLE=TEMPLATE_SUMMARY
```

Confirm these prerequisites with the cross team:

- Account identifier, warehouse, database, schema, and approved role. The role
  can be omitted if the user has a suitable default role.
- Authentication method. The current connector uses username/password;
  browser SSO, key-pair authentication, or other methods require code changes.
  Confirm that password authentication is permitted by the account's policies.
- Permissions: `USAGE` on the warehouse, database, and schema; `SELECT` on all
  four tables; `UPDATE` on the forecast table; and `INSERT` on the summary table
  for creating or uploading templates. Confirm the summary object is writable.
- Actual table names and columns must match the queries in
  [`snowflake_repository.py`](backend/app/repositories/snowflake_repository.py)
  and [`query_builder.py`](backend/app/repositories/query_builder.py).
- Any VPN, firewall, or Snowflake network-policy requirements.

After configuration, restart the backend. From the workspace root on Windows:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Starting from `backend` ensures the application loads `backend/.env`.
Request `http://localhost:8000/api/templates` to verify authentication and access
to the summary table, then verify the forecast and budget endpoints to check
their table access. `/health` reports the selected repository but does **not**
test Snowflake connectivity.

Keep credentials only in the ignored local environment file, never in chat or
Git. To return to mock data, set `DATA_REPOSITORY=mock` and restart the backend.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`.

### Checks
```bash
cd backend && ruff check app tests && black --check app tests && pytest
cd frontend && npm run format:check && npm run lint && npm test -- --run
```

## Architecture
Browser → feature hooks/services → FastAPI routes → services → repository interface → mock or Snowflake repository. Both grids use AG Grid's Community Infinite Row Model datasource for server-side pagination, sorting, and filtering. Requests use `startRow`, `endRow`, `sortModel`, and `filterModel`; responses use `{ rows, totalRowCount }`. Use **Add row** to create a forecast record, edit allowed cells inline, then **Save** pending edits. Selected rows can be bulk-updated.

## Screens
1. **Forecast landing**: template/version/status/KPI list and navigation.
2. **Forecast template**: metadata, KPI cards, editable AG Grid, add row, duplicate, bulk actions, save, export, reset layout.
3. **Budget Holder**: complete Budget Table schema; the 13 workbook-marked
   editable fields support inline editing, bulk updates, Excel/TSV paste, and save.

Forecast and Budget Holder grids use column-header filter menus without a separate
floating filter row.

Forecast and budget columns can be reordered, but dragging them outside the grid no longer
hides them. Previously hidden Brand columns are restored when the template opens,
preserving saved column order and widths. Use **Reset layout** to restore the
complete default column layout.

## API endpoints
- `GET /api/templates`
- `POST /api/templates` creates one forecast template.
- `POST /api/templates/upload` imports 1–500 template records from a CSV payload.
- `GET /api/templates/{template_name}/metadata`
- `POST /api/templates/{template_name}/rows/query`
- `POST /api/templates/{template_name}/rows/validate`
- `POST /api/templates/{template_name}/rows/save`
- `GET /api/templates/{template_name}/dimensions?parentField=&parentValue=`
- `GET /api/templates/{template_name}/export`
- CSV upload requires `Template Name` and `Version` headers. Optional headers are
  `Section`, `Status`, `Current Forecast`, `Prior Forecast`, and `Variance`.
- `POST /api/templates/{template_name}/actions/{action_name}`
- `POST /api/budget/query`
- `PATCH /api/budget/bulk-update`
- `GET /health`

## Performance decisions
AG Grid virtualization remains enabled. The frontend requests only a page at a time, debounces text search, cancels stale requests, uses stable `UNIQ_ID` row IDs, memoized column definitions, and preserves column state separately from row state. Snowflake receives allow-listed sort/filter/pagination operations. Large datasets are never loaded completely into the browser.

## Figma Adaptation Plan
The interim design is isolated in `src/styles/tokens.css`, `src/styles/app.css`, and layout components. Replace tokens, shell markup, typography, spacing, and component CSS when the supplied Figma is approved. Feature hooks, API services, grid metadata, backend contracts, and business rules do not depend on visual styling.
