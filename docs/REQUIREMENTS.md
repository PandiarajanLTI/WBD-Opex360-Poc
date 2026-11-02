# Requirements summary and traceability

## Feature inventory and workflows
- Landing summary with template drill-down, status, version, current/prior forecast, variance, and refresh timestamps.
- Forecast grid with dimensions, descriptors, monthly actual/forecast values, notes, calculated summaries, read-only/editable styling, server pagination/filter/sort, record count, validation, insert five, duplicate, save, actions, and export.
- Dimension validation for Company Code, Cost Center, and Profit Center.
- Budget maintenance grid with workbook-defined bulk-editable fields.

Primary demo flow: open template → inspect KPIs → filter/sort/reorder/pin → edit Nov/Dec/notes → insert five → validate/correct → save → export → repeat with another template.

## Data model
- `TEMPLATE_SUMMARY`: landing-level aggregate keyed logically by template/section/version.
- `FORECAST_TEMPLATE`: row-level forecast facts; `UNIQ_ID` is the POC key and `TEMPLATE_PRIMARY_KEY`/`ALL_DIM_ID` are retained.
- `DIMENSION_MAPPING`: Company Code + Cost Center + Profit Center + Closed status.
- `BUDGET_TABLE`: cost-center metadata with selected bulk-editable attributes.
- Relationships: summary `TEMPLATE_NAME` → forecast `TEMPLATE_NAME`; forecast dimension triplet → mapping triplet; forecast `COST_CENTER` → budget `COSTCENTER` (assumed logical relation).

## Traceability matrix
| Requirement | UI/component | API | Service/use case | Table/view |
|---|---|---|---|---|
| FR-01–04 | ForecastGrid, column metadata | rows/query | query rows | FORECAST_TEMPLATE |
| FR-05–07 | validation markers, dependent editor hook | rows/validate, dimensions | validate rows | DIMENSION_MAPPING, FORECAST_TEMPLATE |
| FR-08–09 | Insert 5, Duplicate | rows/save | persist inserted rows | FORECAST_TEMPLATE |
| FR-10–11 | grid multi-cell editing, actions | actions/{name} | bulk action | FORECAST_TEMPLATE |
| FR-12–15 | filters, sort, paging, count | rows/query | query grid page | FORECAST_TEMPLATE |
| FR-16 | KPI cards | metadata, templates | aggregate KPIs | TEMPLATE_SUMMARY / forecast aggregate |
| FR-17–18 | Save, zero warning | rows/save | validate and save | FORECAST_TEMPLATE, DIMENSION_MAPPING |
| FR-19 | Export | export | stream relevant rows | FORECAST_TEMPLATE |
| FR-20 | column layout/reset | local column state | N/A | N/A |
| Workbook landing | LandingPage | templates | list summaries | TEMPLATE_SUMMARY |
| Workbook actions | Actions menu | actions/{name} | copy prior/distribute variance | FORECAST_TEMPLATE |
| Workbook budget | BudgetPage | budget/query, bulk-update | budget maintenance | BUDGET_TABLE |

## Conflict decisions
- Functional requirements ask for Excel export while license status is open. The running Community build exports CSV; true XLSX export is isolated behind the export endpoint and can be switched after Enterprise licensing is confirmed.
- The functional document prioritizes the forecast screen; the workbook adds landing and budget sheets. They are implemented as lightweight schema-led screens without inventing template administration.
