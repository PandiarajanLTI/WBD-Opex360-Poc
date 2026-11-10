import { describe, expect, it } from 'vitest';
import { createForecastColumns } from '../models/columns';
import {
  getDefaultColumnState,
  limitPinnedDescriptorColumns,
  normalizeMovedColumnState,
  orderDescriptorColumnsFirst,
} from './columnState';
describe('column state', () => {
  const defs = createForecastColumns();
  it('moves saved metadata descriptors before months while preserving visibility and width', () => {
    const definitions = createForecastColumns(['DER_PROJECT_NAME', 'CURRENCY', 'AGG_TYPE']);
    const saved = [
      { colId: 'TEMPLATE_NAME', pinned: 'left' },
      { colId: 'JAN_FORECAST', width: 110 },
      { colId: 'DER_PROJECT_NAME', width: 180, hide: false },
      { colId: 'CURRENCY', width: 140 },
      { colId: 'AGG_TYPE', width: 140 },
    ];
    const restored = orderDescriptorColumnsFirst(saved, definitions);
    expect(restored.slice(0, 17).map((column) => column.colId)).toEqual(
      definitions.slice(0, 17).map((column) => column.colId),
    );
    expect(restored.find((column) => column.colId === 'DER_PROJECT_NAME')).toEqual(saved[2]);
    expect(restored.find((column) => column.colId === 'CURRENCY')).toEqual({
      ...saved[3], hide: false,
    });
    expect(restored.at(-1)).toEqual(saved[1]);
  });
  it('pins all requested dimensions and leaves values in the center', () => {
    const state = getDefaultColumnState(defs);
    expect(state.find((c) => c.colId === 'TEMPLATE_NAME').pinned).toBe('left');
    expect(state.find((c) => c.colId === 'COMPANY_CODE').pinned).toBe('left');
    expect(state.find((c) => c.colId === 'NOTES').pinned).toBe(null);
    expect(
      state
        .filter((c) => c.colId.endsWith('_FORECAST'))
        .slice(0, 2)
        .map((c) => c.colId),
    ).toEqual(['JAN_FORECAST', 'FEB_FORECAST']);
  });
  it('does not pin center columns when they are moved within the center region', () => {
    const state = [
      { colId: 'COMPANY_CODE', pinned: null },
      { colId: 'NOTES', pinned: null },
      { colId: 'JAN_FORECAST', pinned: null },
    ];
    expect(
      normalizeMovedColumnState(state, 'NOTES', ['JAN_FORECAST'])[1].pinned,
    ).toBe(null);
  });
  it('restores dimension pinning while keeping notes and months in the center', () => {
    const saved = [
      { colId: 'TEMPLATE_NAME', pinned: 'left' },
      { colId: 'COMPANY_CODE', pinned: 'left' },
      { colId: 'NOTES', pinned: 'left' },
      { colId: 'JAN_FORECAST', pinned: null },
    ];
    expect(
      limitPinnedDescriptorColumns(saved).map(({ pinned }) => pinned),
    ).toEqual(['left', 'left', null, null]);
  });
});
