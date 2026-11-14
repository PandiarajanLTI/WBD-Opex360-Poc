# Backend review and changes

## Finding
The uploaded API was **not** returning all Template fields. `query_builder.py` had only 23 entries in `ALLOWED_COLUMNS`, and `SELECT_COLUMNS` was built from that limited set. `metadata()` also did not send column definitions to the frontend.

## Changes
- Exact 256-column allow-list generated from `SampleData_POC.xlsx`.
- `requestedColumns` added to `GridQuery`. Omitted/null returns all 256 fields. A supplied list selects only validated fields.
- Metadata now exposes `columns`, `defaultColumns`, `columnGroups`, and `editableColumns`.
- Filtering and sorting work on every allow-listed Template field.
- Export receives all fields because its request omits `requestedColumns`.
- Inserts can accept every workbook field. Existing-row updates remain intentionally restricted to NOV_FORECAST, DEC_FORECAST, NOTES, and COMMENT.
- Existing updates are scoped by both UNIQ_ID and TEMPLATE_NAME.
- Hardcoded Snowflake credentials were removed from `config.py`; use `.env`.

## API test
POST `/api/templates/Template%201/rows/query` with:
```json
{"startRow":0,"endRow":20,"sortModel":[],"filterModel":{},"requestedColumns":null}
```
This returns 12 rows and all 256 fields per row, subject to null serialization.

GET `/api/templates/Template%201/metadata` returns all available fields for dynamic AG Grid column definitions.
