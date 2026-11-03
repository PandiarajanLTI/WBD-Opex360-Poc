export function parseClipboardText(text) {
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n');
  return lines.map((line) => line.split('\t'));
}

// Applies a pasted matrix starting at the focused cell; only editable columns are changed.
export function applyPasteToGrid(api, matrix) {
  const focused = api.getFocusedCell();
  if (!focused) return [];
  const columns = api.getAllDisplayedColumns();
  const startCol = columns.findIndex(
    (c) => c.getColId() === focused.column.getColId(),
  );
  const changed = new Map();
  matrix.forEach((cells, r) => {
    const node = api.getDisplayedRowAtIndex(focused.rowIndex + r);
    if (!node) return;
    cells.forEach((raw, c) => {
      const column = columns[startCol + c];
      if (!column || !column.isCellEditable(node)) return;
      const colDef = column.getColDef();
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
