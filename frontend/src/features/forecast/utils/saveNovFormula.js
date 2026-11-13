const PAGE_SIZE = 500;

function calculateNov(row, calculate) {
  const value = calculate(row);
  if (value === null || !Number.isFinite(value)) {
    throw new Error(`Cannot calculate NOV for row ${row.UNIQ_ID ?? '(new)'}. Check for missing inputs or division by zero; no changes were saved.`);
  }
  return value;
}

function cleanRow(row) {
  const clean = { ...row };
  delete clean.__editedFields;
  delete clean.__editedAt;
  delete clean.__recentlyUpdated;
  return clean;
}

// Fetch the unfiltered template before saving so pagination is unaffected by updates.
export async function buildNovFormulaPayload({ templateName, calculate, dirtyRows, queryRows, onProgress }) {
  const pending = new Map(dirtyRows.map((row) => [String(row.UNIQ_ID), row]));
  const seen = new Set();
  const payload = [];
  let total;
  for (let startRow = 0; total === undefined || startRow < total; startRow += PAGE_SIZE) {
    const result = await queryRows(templateName, {
      startRow,
      endRow: startRow + PAGE_SIZE,
      sortModel: [{ colId: 'UNIQ_ID', sort: 'asc' }],
      filterModel: {},
    });
    if (!Array.isArray(result.rows) || !Number.isInteger(result.totalRowCount) || result.totalRowCount < 0 || (total !== undefined && result.totalRowCount !== total)) {
      throw new Error('The template changed while loading. No changes were saved; please retry.');
    }
    total = result.totalRowCount;
    if (result.rows.length !== Math.min(PAGE_SIZE, total - startRow)) {
      throw new Error('Could not load every template row. No changes were saved; please retry.');
    }
    for (const row of result.rows) {
      const id = String(row.UNIQ_ID);
      if (row.UNIQ_ID == null || seen.has(id)) {
        throw new Error('The template contains missing or duplicate row IDs. No changes were saved.');
      }
      seen.add(id);
      const dirty = pending.get(id);
      const source = dirty ? { ...row, ...dirty } : row;
      const nov = calculateNov(source, calculate);
      payload.push(dirty
        ? { ...cleanRow(source), NOV_FORECAST: nov }
        : { UNIQ_ID: row.UNIQ_ID, CURRENCY: row.CURRENCY, NOV_FORECAST: nov });
      pending.delete(id);
    }
    onProgress?.(payload.length, total);
  }
  // Only genuinely new rows may be absent from the queried template.
  for (const row of pending.values()) {
    if (row.UNIQ_ID != null && Number(row.UNIQ_ID) > 0) {
      throw new Error(`Edited row ${row.UNIQ_ID} was not found in the template. No changes were saved.`);
    }
    payload.push({ ...cleanRow(row), NOV_FORECAST: calculateNov(row, calculate) });
  }
  return payload;
}

export function calculateDirtyNovRows(rows, calculate) {
  return rows.map((row) => ({ ...cleanRow(row), NOV_FORECAST: calculateNov(row, calculate) }));
}