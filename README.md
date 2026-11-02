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
Browser → feature hooks/services → FastAPI routes → services → repository interface → mock or Snowflake repository. Grid requests use `startRow`, `endRow`, `sortModel`, `filterModel`; responses use `{ rows, totalRowCount }`.

## Screens
1. **Forecast landing**: template/version/status/KPI list and navigation.
2. **Forecast template**: metadata, KPI cards, editable AG Grid, insert five, duplicate, bulk actions, save, export, reset layout.
3. **Budget maintenance**: schema-led editable/non-editable AG Grid view.

## API endpoints
- `GET /api/templates`
- `GET /api/templates/{template_name}/metadata`
- `POST /api/templates/{template_name}/rows/query`
- `POST /api/templates/{template_name}/rows/validate`
- `POST /api/templates/{template_name}/rows/save`
- `GET /api/templates/{template_name}/dimensions?parentField=&parentValue=`
- `GET /api/templates/{template_name}/export`
- `POST /api/templates/{template_name}/actions/{action_name}`
- `POST /api/budget/query`
- `PATCH /api/budget/bulk-update`
- `GET /health`

## Performance decisions
AG Grid virtualization remains enabled. The frontend requests only a page at a time, debounces text search, cancels stale requests, uses stable `UNIQ_ID` row IDs, memoized column definitions, and preserves column state separately from row state. Snowflake receives allow-listed sort/filter/pagination operations. Large datasets are never loaded completely into the browser.

## Figma Adaptation Plan
The interim design is isolated in `src/styles/tokens.css`, `src/styles/app.css`, and layout components. Replace tokens, shell markup, typography, spacing, and component CSS when the supplied Figma is approved. Feature hooks, API services, grid metadata, backend contracts, and business rules do not depend on visual styling.
