import { isLockedLeft } from '../models/columns';

export function getDefaultColumnState(columnDefinitions) {
  return columnDefinitions.map((column, index) => ({
    colId: column.colId,
    pinned: isLockedLeft(column.colId) ? 'left' : null,
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
export function orderDescriptorColumnsFirst(state, columnDefinitions) {
  const descriptors = columnDefinitions.filter(
    (column) => column.context?.columnType === 'descriptor',
  );
  const descriptorIds = new Set(descriptors.map((column) => column.colId));
  const savedById = new Map(state.map((column) => [column.colId, column]));
  return [
    ...descriptors.map((column) => ({
      ...savedById.get(column.colId),
      colId: column.colId,
      ...(column.lockPinned ? { hide: false } : {}),
    })),
    ...state.filter((column) => !descriptorIds.has(column.colId)),
  ];
}
export function limitPinnedDescriptorColumns(state) {
  return state.map((column) => ({
    ...column,
    pinned: isLockedLeft(column.colId) ? 'left' : null,
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
