// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
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
  expect(props.cacheBlockSize).toBe(100);
  expect(props.pagination).toBe(true);
  expect(props.paginationPageSize).toBe(100);
  expect(props.paginationPageSizeSelector).toEqual([100, 200, 500, 1000]);
  expect(props.rowSelection).toEqual({
    mode: 'multiRow',
    headerCheckbox: false,
    selectAll: 'currentPage',
  });
  expect(props.selectionColumnDef.headerComponent.name).toBe(
    'SelectAllRowsHeader',
  );
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

it('refreshes the budget rows after a successful save', async () => {
  await act(async () => {
    render(<BudgetPage />);
  });
  const props = grid.mock.lastCall[0];
  const purgeInfiniteCache = vi.fn();
  const applyColumnState = vi.fn();
  const deselectAll = vi.fn();
  props.onGridReady({ api: { purgeInfiniteCache, applyColumnState, deselectAll } });
  const editedRow = { COSTCENTER: 'C001', REGION: 'Europe' };
  act(() => {
    props.onCellValueChanged({ data: editedRow, colDef: { field: 'REGION' } });
  });
  expect(editedRow.__editedFields).toEqual(['REGION']);
  expect(
    props.columnDefs
      .find(({ field }) => field === 'REGION')
      .cellClassRules['recently-edited-cell']({ data: editedRow }),
  ).toBe(true);
  apiJson.mockResolvedValueOnce({
    message: 'Saved 1 budget holder mapping row(s).',
  });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save 1' }));
  });

  expect(apiJson).toHaveBeenCalledWith(
    '/budget/bulk-update',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        rows: [{ COSTCENTER: 'C001', REGION: 'Europe' }],
      }),
    }),
  );
  expect(purgeInfiniteCache).toHaveBeenCalledOnce();
  expect(deselectAll).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Bulk update (0)' }).disabled).toBe(
    true,
  );
  expect(applyColumnState).toHaveBeenCalledWith({
    state: [{ colId: 'UPDATED_ON', sort: 'desc', sortIndex: 0 }],
    defaultState: { sort: null },
  });
  expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);
});

it('uses header filter menus like Build Forecasts without a floating filter row', async () => {
  await act(async () => {
    render(<BudgetPage />);
  });
  const { defaultColDef, columnDefs } = grid.mock.lastCall[0];

  expect(defaultColDef.filter).toBe(true);
  expect(defaultColDef.floatingFilter).toBe(false);
  expect(defaultColDef.suppressHeaderMenuButton).toBe(false);
  expect(
    columnDefs.every((column) => column.filter === 'agTextColumnFilter'),
  ).toBe(true);
});

it('uses the Budget Table schema for columns, editing, and bulk updates', async () => {
  await act(async () => {
    render(<BudgetPage />);
  });
  const props = grid.mock.lastCall[0];
  const expectedFields = [
    'COSTCENTER',
    'COSTCENTER_NAME',
    'L3',
    'L4',
    'L5',
    'L6',
    'L7',
    'CLOSED',
    'FUNCTIONAL_AREA',
    'FUNCTIONAL_AREA_DESCRIPTION',
    'COR_SGA_CLASSIFICATION',
    'COMPANY_CODE',
    'COMPANY_CODE_DESCRIPTION',
    'PROFIT_CENTER',
    'PROFIT_CENTER_DESCRIPTION',
    'DEFAULT_BRAND',
    'DEFAULT_GEOGRAOPHY',
    'LEGACY_SYSTEM',
    'FUNCTION',
    'SUBFUNCTION',
    'COE_TEAM',
    'COE_SUB_TEAM',
    'COE_POC',
    'BU_POC',
    'BUDGET_HOLDER',
    'REGION',
    'LOCATION',
    'CITY',
    'CUSTOM_1',
    'CUSTOM_2',
    'CUSTOM_3',
    'UPDATED_ON',
    'UPDATED_BY',
    'USER_ID',
  ];
  const editableFields = [
    'FUNCTION',
    'SUBFUNCTION',
    'COE_TEAM',
    'COE_SUB_TEAM',
    'COE_POC',
    'BU_POC',
    'BUDGET_HOLDER',
    'REGION',
    'LOCATION',
    'CITY',
    'CUSTOM_1',
    'CUSTOM_2',
    'CUSTOM_3',
  ];

  expect(props.columnDefs.map(({ field }) => field)).toEqual(expectedFields);
  expect(
    props.columnDefs
      .filter(({ editable }) => editable)
      .map(({ field }) => field),
  ).toEqual(editableFields);
  expect(
    props.columnDefs
      .filter(({ pinned }) => pinned === 'left')
      .map(({ field }) => field),
  ).toEqual(['COSTCENTER']);

  act(() => {
    props.onSelectionChanged({
      api: { getSelectedRows: () => [{ COSTCENTER: 'C001' }] },
    });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Bulk update (1)' }));
  const dialog = screen.getByRole('dialog', { name: 'Bulk update' });
  expect(
    within(dialog).getByLabelText('Field').querySelectorAll('option'),
  ).toHaveLength(editableFields.length);
  expect(
    Array.from(
      within(dialog).getByLabelText('Field').options,
      ({ value }) => value,
    ),
  ).toEqual(editableFields);
});
