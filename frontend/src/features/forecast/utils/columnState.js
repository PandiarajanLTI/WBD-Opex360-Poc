export function getDefaultColumnState(columnDefinitions) {
  return columnDefinitions.map((column, index) => ({
    colId: column.colId,
    pinned: column.colId === 'TEMPLATE_NAME' ? 'left' : null,
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
          pinned: movedIndex >= monthStart ? null : (column.pinned ?? null),
        }
      : column,
  );
}
export function limitPinnedDescriptorColumns(state) {
  return state.map((column) => ({
    ...column,
    pinned: column.colId === 'TEMPLATE_NAME' ? 'left' : null,
  }));
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
