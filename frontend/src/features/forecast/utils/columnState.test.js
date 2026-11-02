import { describe, expect, it } from 'vitest';
import { createForecastColumns } from '../models/columns';
import {
  getDefaultColumnState,
  normalizeMovedColumnState,
} from './columnState';
describe('column state', () => {
  const defs = createForecastColumns();
  it('pins descriptors and centers chronological months', () => {
    const state = getDefaultColumnState(defs);
    expect(state.find((c) => c.colId === 'COMPANY_CODE').pinned).toBe('left');
    expect(
      state
        .filter((c) => c.colId.endsWith('_FORECAST'))
        .slice(0, 2)
        .map((c) => c.colId),
    ).toEqual(['JAN_FORECAST', 'FEB_FORECAST']);
  });
  it('unpins a descriptor moved into month region', () => {
    const state = [
      { colId: 'JAN_FORECAST', pinned: null },
      { colId: 'COMPANY_CODE', pinned: 'left' },
    ];
    expect(
      normalizeMovedColumnState(state, 'COMPANY_CODE', ['JAN_FORECAST'])[1]
        .pinned,
    ).toBe(null);
  });
});
