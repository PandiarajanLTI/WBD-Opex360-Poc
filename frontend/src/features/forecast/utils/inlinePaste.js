import { isInlineNewRowEditable } from '../models/columns';

const INLINE_ROW_READ_ONLY_FIELDS = new Set([
  'UNIQ_ID',
  'ID',
  'ALL_DIM_ID',
  'TEMPLATE_PRIMARY_KEY',
  'TEMPLATE_NAME',
  'VERSION',
  'UPDATED_TS',
  'FY_WORKING_FORECAST',
  'FY_WORKING_FORECAST_PRATE',
  'FX_RATE',
  'FX_RATE_TYPE',
  'FX_YEAR',
]);

export function mapInlinePaste({ text, field, api, columnDefs, values }) {
  const matrix = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.split('\t'));
  const displayedColumns = api?.getAllDisplayedColumns?.();
  const columns = displayedColumns
    ? displayedColumns.filter((column) => column?.getColDef?.()?.field)
    : columnDefs
        .filter((column) => column.field)
        .map((column) => ({
          getColDef: () => column,
          getColId: () => column.colId ?? column.field,
        }));
  const normalize = (value) =>
    String(value ?? '')
      .trim()
      .toLocaleLowerCase();
  const columnsByHeader = new Map();
  const columnsByField = new Map();
  columns.forEach((column) => {
    const definition = column.getColDef();
    columnsByField.set(definition.field, column);
    [definition.headerName, definition.field, column.getColId?.()].forEach(
      (header) => {
        if (header) columnsByHeader.set(normalize(header), definition.field);
      },
    );
  });

  const headerFields = matrix[0].map((header) =>
    columnsByHeader.get(normalize(header)),
  );
  const hasHeaders = headerFields.some(Boolean);
  const pastedValues = hasHeaders ? (matrix[1] ?? []) : matrix[0];
  const canEdit = (column) => {
    const definition = column.getColDef();
    const target = definition.field;
    if (
      INLINE_ROW_READ_ONLY_FIELDS.has(target) ||
      !isInlineNewRowEditable(definition)
    ) {
      return false;
    }
    if (typeof definition.editable === 'function') {
      return Boolean(
        definition.editable({ data: { ...values, INSERTED: 'Y' } }),
      );
    }
    return definition.editable !== false;
  };
  const writableColumns = columns.filter(canEdit);
  const startIndex = columns.findIndex(
    (column) => column.getColDef().field === field,
  );

  let targetFields;
  if (hasHeaders) {
    targetFields = headerFields;
  } else if (
    pastedValues.length === columns.length ||
    pastedValues.length === writableColumns.length
  ) {
    // A complete Excel row should fill the whole new row, regardless of which
    // inline input happened to receive focus.
    targetFields =
      pastedValues.length === columns.length
        ? columns.map((column) => column.getColDef().field)
        : writableColumns.map((column) => column.getColDef().field);
  } else {
    const firstColumn = Math.max(startIndex, 0);
    targetFields = columns
      .slice(firstColumn, firstColumn + pastedValues.length)
      .map((column) => column.getColDef().field);
  }

  const changes = {};
  pastedValues.forEach((raw, index) => {
    const target = targetFields[index];
    const column = columnsByField.get(target);
    if (!column || !canEdit(column)) return;

    const definition = column.getColDef();
    let parsed = raw.trim();
    if (definition.valueParser) {
      parsed = definition.valueParser({ newValue: parsed, data: values });
    } else if (definition.type === 'numericColumn' && parsed !== '') {
      parsed = Number(parsed);
    }
    if (typeof parsed === 'number' && !Number.isFinite(parsed)) return;
    changes[target] = parsed;
  });
  return changes;
}

export function mapInlinePasteRows({ text, field, api, columnDefs, values }) {
  const matrix = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.split('\t'));
  const normalizedValues = values ?? {};
  return matrix.map((cells) =>
    mapInlinePaste({
      text: cells.join('\t'),
      field,
      api,
      columnDefs,
      values: normalizedValues,
    }),
  );
}