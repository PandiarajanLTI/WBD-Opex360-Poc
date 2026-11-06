import { describe, expect, it } from 'vitest';
import { createForecastColumns } from '../models/columns';
import {
  getDefaultColumnState,
  limitPinnedDescriptorColumns,
  normalizeMovedColumnState,
} from './columnState';
describe('column state', () => {
  const defs = createForecastColumns();
  it('pins only the template descriptor and centers remaining columns', () => {
    const state = getDefaultColumnState(defs);
    expect(state.find((c) => c.colId === 'TEMPLATE_NAME').pinned).toBe('left');
    expect(state.find((c) => c.colId === 'COMPANY_CODE').pinned).toBe(null);
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
  it('migrates wide saved pinned layouts to keep the center pane available', () => {
    const saved = [
      { colId: 'TEMPLATE_NAME', pinned: 'left' },
      { colId: 'COMPANY_CODE', pinned: 'left' },
      { colId: 'NOTES', pinned: 'left' },
      { colId: 'JAN_FORECAST', pinned: null },
    ];
    expect(
      limitPinnedDescriptorColumns(saved).map(({ pinned }) => pinned),
    ).toEqual(['left', null, null, null]);
  });
});
