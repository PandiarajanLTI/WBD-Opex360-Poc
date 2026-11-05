export function parseClipboardText(text) {
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n');
  return lines.map((line) => line.split('\t'));
}

const IMMUTABLE_COLUMNS = new Set([
  'UNIQ_ID',
  'TEMPLATE_NAME',
  'FY_WORKING_FORECAST',
  'COSTCENTER',
]);

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
