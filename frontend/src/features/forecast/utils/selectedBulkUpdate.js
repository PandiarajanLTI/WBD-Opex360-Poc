// Helpers for "Bulk update selected": updates only the rows that are currently
// selected (and therefore already loaded in the grid). No row is re-fetched.

export const SELECTED_BULK_FIELDS = [
  { field: 'NOV_FORECAST', label: 'November Forecast', type: 'number' },
  { field: 'DEC_FORECAST', label: 'December Forecast', type: 'number' },
];

// When a NOV formula is active NOV is calculated, so only DEC can be bulk edited.
export const SELECTED_BULK_FIELDS_WITHOUT_NOV = SELECTED_BULK_FIELDS.filter(
  ({ field }) => field !== 'NOV_FORECAST',
);

export function chunkRows(rows, size) {
  const chunks = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
}

// UI-only helpers such as __editedFields / __recentlyUpdated must never be sent to the API.
export function stripInternalFields(row) {
  const clean = {};
  Object.keys(row).forEach((key) => {
    if (!key.startsWith('__')) clean[key] = row[key];
  });
  return clean;
}

// Selected nodes that really hold a loaded data row (no placeholders, no inline "new row" editors).
export function getSelectedForecastNodes(api) {
  const nodes = api?.getSelectedNodes?.() ?? [];
  const seen = new Set();
  return nodes.filter((node) => {
    const data = node?.data;
    if (!data || node.rowPinned || data.__INLINE_NEW_ROW) return false;
    if (seen.has(node)) return false;
    seen.add(node);
    return true;
  });
}

export function buildSelectedBulkPayload(nodes, field, value) {
  return nodes.map((node) => ({ ...stripInternalFields(node.data), [field]: value }));
}

// Updates the row objects in place. The same objects are referenced by the AG Grid
// blocks and by the datasource cache, so scrolling never shows the old value again.
export function applySelectedBulkValue(nodes, field, value, now = Date.now()) {
  nodes.forEach((node) => {
    const editedFields = new Set(node.data.__editedFields ?? []);
    editedFields.add(field);
    Object.assign(node.data, {
      [field]: value,
      __editedFields: [...editedFields],
      __editedAt: now,
      __recentlyUpdated: true,
    });
  });
}
