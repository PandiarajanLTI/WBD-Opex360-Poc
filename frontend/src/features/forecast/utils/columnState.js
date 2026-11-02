export function getDefaultColumnState(columnDefinitions) {
  return columnDefinitions.map((column, index) => ({
    colId: column.colId,
    pinned:
      column.columnType === 'month' || column.columnType === 'summary'
        ? null
        : 'left',
    hide: false,
    sort: null,
    sortIndex: null,
    order: index,
  }));
}
export function normalizeMovedColumnState(
  state,
  movedColumnId,
  monthColumnIds,
) {
  const monthStart = state.findIndex((column) =>
    monthColumnIds.includes(column.colId),
  );
  const movedIndex = state.findIndex(
    (column) => column.colId === movedColumnId,
  );
  return state.map((column) =>
    column.colId === movedColumnId
      ? {
          ...column,
          pinned: movedIndex >= monthStart ? null : (column.pinned ?? 'left'),
        }
      : column,
  );
}
export function saveColumnState(templateName, state) {
  localStorage.setItem(
    `opex360:grid:${templateName}`,
    JSON.stringify(
      state.map(({ colId, pinned, width, hide }) => ({
        colId,
        pinned,
        width,
        hide,
      })),
    ),
  );
}
export function loadColumnState(templateName) {
  try {
    return JSON.parse(localStorage.getItem(`opex360:grid:${templateName}`));
  } catch {
    return null;
  }
}
