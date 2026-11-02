# Assumptions and identified gaps

- The workbook presents logical sheets rather than confirmed physical Snowflake table names. Configurable defaults are `FORECAST_TEMPLATE`, `BUDGET_TABLE`, `DIMENSION_MAPPING`, and `TEMPLATE_SUMMARY`.
- `UNIQ_ID` is treated as the stable row key. New mock rows receive negative temporary IDs until save.
- The 10+2 cycle makes `NOV_FORECAST` and `DEC_FORECAST` editable. Cycle metadata should replace this assumption later.
- Required insert fields are interpreted from the workbook's mandatory column indications and isolated in backend constants.
- Combination validation uses Company Code + Cost Center + Profit Center and requires an active mapping (`CLOSED != 'YES'`).
- AG Grid Community is used so the project runs without a commercial key. Native Excel export, range selection/fill handle, and the server-side row model are Enterprise features. This POC uses CSV export with an `.csv` response, multi-row editing, clipboard-compatible cells, and server-driven pagination. Upgrade `ag-grid-community` to Enterprise only after license confirmation.
- Cross-boundary column dragging is implemented through public column-state APIs and `onColumnMoved`. AG Grid's separate pinned/center drop zones can limit the exact gesture. The isolated `columnState.js` logic automatically unpins moved descriptor columns when their resulting state is centered and re-pins them when restored through the reset/default action. No DOM manipulation is used.
- The workbook's `NUMBER(382)`/`NUMBER(388)` are preserved in documentation but mapped to Python `Decimal` and Snowflake numeric columns as configured.
- Currency conversion source/rates, exact special-character rules, final approved datasets, performance thresholds, and EPM/reporting integration were not supplied.
- Mock data is synthetic and contains no production or personal data.

## Bulk update and pinned-column behavior
- Forecast bulk update exposes fields already editable in the POC: November forecast, December forecast, and Notes. It applies changes to selected rows and reuses the validated Save endpoint.
- All descriptor/non-month columns begin pinned left, but `lockPinned` is disabled and descriptor columns do not use `lockPosition`. The public AG Grid column APIs normalize and persist the resulting pin and order state without DOM manipulation.
