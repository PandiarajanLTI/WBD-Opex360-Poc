export function parseClipboardText(text) {
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n');
  return lines.map((line) => line.split('\t'));
}

export function copyRowsToClipboard(
  api,
  { includeHeaders = true, focusedCellOnly = false } = {},
) {
  const displayedColumns = api
    ?.getAllDisplayedColumns?.()
    .filter((column) => column.getColDef().field);
  if (!displayedColumns?.length) return '';

  const focused = api.getFocusedCell?.();
  const selectedNodes = focusedCellOnly
    ? []
    : api.getSelectedNodes?.()?.filter((node) => node?.data) ?? [];
  const nodes = selectedNodes.length
    ? selectedNodes.sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0))
    : [api.getDisplayedRowAtIndex?.(focused?.rowIndex)].filter((node) => node?.data);
  const copiedColumns =
    selectedNodes.length && !focusedCellOnly
      ? displayedColumns
      : displayedColumns.filter(
          (column) => column.getColId?.() === focused?.column?.getColId?.(),
        );
  if (!copiedColumns.length) return '';

  const copiedData = nodes
    .map((node) =>
      copiedColumns
        .map((column) => {
          const colDef = column.getColDef();
          const value = api.getValue
            ? api.getValue(column, node)
            : node.data[colDef.field];
          const formatted = colDef.valueFormatter
            ? colDef.valueFormatter({
                value,
                data: node.data,
                node,
                column,
                colDef,
                api,
              })
            : value;
          return String(formatted ?? '').replace(/[\t\r\n]+/g, ' ');
        })
        .join('\t'),
    )
    .join('\n');
  const headers = copiedColumns
    .map((column) => {
      const colDef = column.getColDef();
      const header = colDef.headerName ?? colDef.field ?? column.getColId?.() ?? '';
      return String(typeof header === 'function' ? header() : header).replace(
        /[\t\r\n]+/g,
        ' ',
      );
    })
    .join('\t');
  return includeHeaders
    ? `${headers}${copiedData ? `\n${copiedData}` : ''}`
    : copiedData;
}

const IMMUTABLE_COLUMNS = new Set([
  'UNIQ_ID',
  'TEMPLATE_NAME',
  'FY_WORKING_FORECAST',
  'COSTCENTER',
]);

export function isFullRowPaste(api, matrix) {
  const columns = api
    .getAllDisplayedColumns()
    .filter((column) => column.getColDef().field);
  return (
    matrix.length > 0 &&
    columns.length > 0 &&
    matrix.every((cells) => cells.length === columns.length)
  );
}

export function createRowsFromFullRowPaste(
  api,
  matrix,
  { templateName, version, createId },
) {
  const columns = api
    .getAllDisplayedColumns()
    .filter((column) => column.getColDef().field);
  if (!isFullRowPaste(api, matrix)) return [];

  return matrix.map((cells) => {
    const row = {
      UNIQ_ID: createId(),
      TEMPLATE_NAME: templateName,
      VERSION: version,
      INSERTED: 'Y',
      __editedFields: [],
      __editedAt: Date.now(),
    };
    cells.forEach((raw, index) => {
      const column = columns[index];
      const field = column.getColDef().field;
      if (IMMUTABLE_COLUMNS.has(field) || field === 'UPDATED_TS' || column.getColDef().context?.calculated) return;
      const value = column.getColDef().valueParser
        ? column.getColDef().valueParser({
            newValue: raw.trim(),
            oldValue: undefined,
            data: row,
            column,
            colDef: column.getColDef(),
            api,
          })
        : raw;
      if (typeof value === 'number' && Number.isNaN(value)) return;
      row[field] = value;
      row.__editedFields.push(field);
    });
    return row;
  });
}

export function createRowsFromHeaderPaste(
  api,
  matrix,
  { templateName, version, createId },
) {
  if (!matrix.length) return null;
  const columns = api
    .getAllDisplayedColumns()
    .filter((column) => column.getColDef().field);
  const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase();
  const columnByHeader = new Map();
  columns.forEach((column) => {
    const colDef = column.getColDef();
    [colDef.headerName, colDef.field, column.getColId()].forEach((header) => {
      if (header) columnByHeader.set(normalize(header), column);
    });
  });
  const sourceColumns = matrix[0].map((header) => columnByHeader.get(normalize(header)));
  if (!sourceColumns.length || sourceColumns.some((column) => !column)) return null;

  return matrix.slice(1).map((cells) => {
    const row = {
      UNIQ_ID: createId(),
      TEMPLATE_NAME: templateName,
      VERSION: version,
      INSERTED: 'Y',
      __editedFields: [],
      __editedAt: Date.now(),
    };
    cells.forEach((raw, index) => {
      const column = sourceColumns[index];
      if (!column) return;
      const colDef = column.getColDef();
      const field = colDef.field;
      if (
        IMMUTABLE_COLUMNS.has(field) ||
        field === 'UPDATED_TS' ||
        colDef.context?.calculated
      ) {
        return;
      }
      const value = colDef.valueParser
        ? colDef.valueParser({
            newValue: raw.trim(),
            oldValue: undefined,
            data: row,
            column,
            colDef,
            api,
          })
        : raw;
      if (typeof value === 'number' && Number.isNaN(value)) return;
      row[field] = value;
      row.__editedFields.push(field);
    });
    return row;
  });
}

// Full-width row pastes start at the first data column; other pastes start at the focused cell.
export function applyPasteToGrid(
  api,
  matrix,
  { allowFullRowPaste = true, editableOnly = false } = {},
) {
  const focused = api.getFocusedCell();
  if (!focused) return [];
  const columns = api
    .getAllDisplayedColumns()
    .filter((column) => column.getColDef().field);
  const focusedCol = columns.findIndex(
    (c) => c.getColId() === focused.column.getColId(),
  );
  if (focusedCol < 0) return [];
  const isFullRowPaste =
    allowFullRowPaste &&
    matrix.length > 0 &&
    matrix.every((cells) => cells.length === columns.length);
  const startCol = isFullRowPaste ? 0 : focusedCol;
  const changed = new Map();
  matrix.forEach((cells, r) => {
    const node = api.getDisplayedRowAtIndex(focused.rowIndex + r);
    if (!node) return;
    cells.forEach((raw, c) => {
      const column = columns[startCol + c];
      if (!column) return;
      const colDef = column.getColDef();
      if (
        IMMUTABLE_COLUMNS.has(colDef.field) ||
        colDef.context?.calculated ||
        ((editableOnly || !isFullRowPaste) && !column.isCellEditable(node))
      ) {
        return;
      }
      const value = colDef.valueParser
        ? colDef.valueParser({
            newValue: raw.trim(),
            oldValue: node.data[colDef.field],
            data: node.data,
            node,
            column,
            colDef,
            api,
          })
        : raw;
      if (typeof value === 'number' && Number.isNaN(value)) return;
      node.setDataValue(column.getColId(), value);
      changed.set(node.id, node.data);
    });
  });
  return [...changed.values()];
}
