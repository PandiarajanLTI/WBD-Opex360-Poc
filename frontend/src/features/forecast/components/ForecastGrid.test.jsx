// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ForecastGrid from './ForecastGrid';

const { grid } = vi.hoisted(() => ({ grid: vi.fn(() => null) }));
vi.mock('ag-grid-react', () => ({ AgGridReact: grid }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('renders exactly one grid and prevents dimensions being automatically unpinned', () => {
  render(<ForecastGrid columnDefs={[{ field: 'TEMPLATE_NAME', pinned: 'left' }]} />);
  expect(grid).toHaveBeenCalledOnce();
  const props = grid.mock.lastCall[0];
  expect(props.alwaysShowHorizontalScroll).toBe(true);
  expect(props.processUnpinnedColumns({ columns: [] })).toEqual([]);
  expect(props.columnDefs[0].pinned).toBe('left');
});