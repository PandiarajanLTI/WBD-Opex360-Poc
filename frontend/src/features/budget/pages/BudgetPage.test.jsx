// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BudgetPage from './BudgetPage';

const { grid, apiJson } = vi.hoisted(() => ({
  grid: vi.fn(() => null),
  apiJson: vi.fn(() => Promise.resolve({ rows: [], totalRowCount: 0 })),
}));

vi.mock('ag-grid-react', () => ({ AgGridReact: grid }));
vi.mock('../../../services/api/apiClient', () => ({
  apiJson,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('prevents dragging columns outside the budget grid from hiding them', async () => {
  await act(async () => {
    render(<BudgetPage />);
  });

  const props = grid.mock.lastCall[0];
  expect(props.suppressDragLeaveHidesColumns).toBe(true);
  expect(props.rowModelType).toBe('infinite');
  expect(props.pagination).toBe(true);
  expect(props.columnDefs[0].filter).toBe('agTextColumnFilter');
  expect(props.defaultColDef.suppressMovable).not.toBe(true);
  expect(
    props.columnDefs.every((column) => column.suppressMovable !== true),
  ).toBe(true);
});

it('passes server pagination, sort, and filter options to the budget API', async () => {
  await act(async () => {
    render(<BudgetPage />);
  });
  const props = grid.mock.lastCall[0];
  const params = {
    startRow: 50,
    endRow: 250,
    sortModel: [{ colId: 'COSTCENTER', sort: 'asc' }],
    filterModel: {
      REGION: { filterType: 'text', type: 'equals', filter: 'Americas' },
    },
    successCallback: vi.fn(),
    failCallback: vi.fn(),
  };

  await act(async () => props.datasource.getRows(params));

  expect(apiJson).toHaveBeenLastCalledWith(
    '/budget/query',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        startRow: 50,
        endRow: 250,
        sortModel: params.sortModel,
        filterModel: params.filterModel,
      }),
    }),
  );
  expect(params.successCallback).toHaveBeenCalledWith([], 0);
});
