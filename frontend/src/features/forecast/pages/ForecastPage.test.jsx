// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForecastPage from './ForecastPage';

const { grid, getMetadata, queryRows, querySummaryRows, saveRows } = vi.hoisted(() => ({
  grid: vi.fn(() => null),
  getMetadata: vi.fn(() => Promise.resolve(null)),
  queryRows: vi.fn(),
  querySummaryRows: vi.fn(),
  saveRows: vi.fn(),
}));

vi.mock('ag-grid-react', () => ({ AgGridReact: grid }));
vi.mock('../hooks/useForecastGrid', () => ({
  useForecastGrid: () => ({
    rows: [],
    totalRowCount: 0,
    isLoading: false,
    dirtyRows: [],
  }),
}));
vi.mock('../services/forecastService', () => ({
  forecastService: {
    getMetadata,
    queryRows,
    querySummaryRows,
    saveRows,
  },
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

async function renderPage() {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/templates/Warner%20Media']}>
        <Routes>
          <Route path="/templates/:templateName" element={<ForecastPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return grid.mock.lastCall[0];
}

describe('forecast column visibility', () => {
  it('renders every column named in forecast metadata', async () => {
    getMetadata.mockResolvedValueOnce({
      columns: [
        'UNIQ_ID',
        'TEMPLATE_NAME',
        'FX_RATE',
        'DER_PROJECT_NAME',
        'UPDATED_TS',
      ],
      kpis: {},
    });

    const props = await renderPage();
    const fields = props.columnDefs.map(({ field }) => field);

    expect(fields).toEqual(
      expect.arrayContaining([
        'UNIQ_ID',
        'FX_RATE',
        'DER_PROJECT_NAME',
        'UPDATED_TS',
      ]),
    );
    expect(props.columnDefs.find(({ field }) => field === 'UPDATED_TS').hide).toBe(
      false,
    );
  });

  it('restores a saved hidden Brand without resetting the rest of the layout', async () => {
    const saved = [
      { colId: 'TEMPLATE_NAME', pinned: 'left', width: 150, hide: false },
      { colId: 'NOTES', pinned: 'left', width: 240, hide: false },
      { colId: 'BRAND', pinned: null, width: 180, hide: true },
      { colId: 'VERSION', pinned: 'left', width: 150, hide: true },
    ];
    localStorage.setItem('opex360:grid:Warner Media', JSON.stringify(saved));
    const props = await renderPage();
    const restored = saved.map((column) => ({
      ...column,
      pinned: column.colId === 'TEMPLATE_NAME' ? 'left' : null,
      ...(column.colId === 'BRAND' ? { hide: false } : {}),
    }));
    const api = {
      applyColumnState: vi.fn(),
      getColumnState: vi.fn(() => restored),
    };

    props.onGridReady({ api });

    expect(api.applyColumnState).toHaveBeenCalledWith({
      state: restored,
      applyOrder: true,
    });
    expect(
      JSON.parse(localStorage.getItem('opex360:grid:Warner Media')),
    ).toEqual(restored);
  });

  it('keeps new layouts unchanged and prevents drag-to-hide', async () => {
    const props = await renderPage();
    const api = { applyColumnState: vi.fn() };

    props.onGridReady({ api });

    expect(api.applyColumnState).not.toHaveBeenCalled();
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
    expect(
      props.columnDefs.find((column) => column.colId === 'NOV_FORECAST').filter,
    ).toBe('agNumberColumnFilter');
    expect(props.columnDefs.find((column) => column.colId === 'BRAND')).toEqual(
      expect.objectContaining({ suppressMovable: false }),
    );
    expect(
      props.columnDefs.filter((column) => column.pinned === 'left'),
    ).toHaveLength(1);
    expect(
      props.columnDefs.find((column) => column.colId === 'COMPANY_CODE').pinned,
    ).toBe(null);
  });

  it('persists field visibility changes in the saved grid layout', async () => {
    const props = await renderPage();
    const state = [
      { colId: 'TEMPLATE_NAME', pinned: 'left', hide: false },
      { colId: 'BRAND', pinned: 'left', hide: true },
    ];
    const api = { getColumnState: vi.fn(() => state) };

    props.onColumnVisible({ api });

    expect(
      JSON.parse(localStorage.getItem('opex360:grid:Warner Media')),
    ).toEqual(state);
  });

  it('switches to the server-backed FSI and region summary view', async () => {
    await renderPage();
    fireEvent.click(screen.getByLabelText('Select forecast view'));
    fireEvent.click(
      screen.getByRole('button', { name: /Summarized by FSI, Region/ }),
    );

    const summaryProps = grid.mock.lastCall[0];
    expect(summaryProps.columnDefs.map(({ field }) => field)).toEqual([
      'FSI_ACCOUNT',
      'GEOGRAPHY',
      'FY_WORKING_FORECAST',
      'ROW_COUNT',
    ]);
    querySummaryRows.mockResolvedValue({
      rows: [{ FSI_ACCOUNT: 'A001', GEOGRAPHY: 'NA', ROW_COUNT: 3 }],
      totalRowCount: 1,
    });
    const successCallback = vi.fn();
    await summaryProps.datasource.getRows({
      startRow: 0,
      endRow: 100,
      sortModel: [],
      filterModel: {},
      successCallback,
      failCallback: vi.fn(),
    });

    expect(querySummaryRows).toHaveBeenCalledWith('Warner Media', {
      startRow: 0,
      endRow: 100,
      sortModel: [],
      filterModel: {},
    });
    expect(successCallback).toHaveBeenCalledWith(
      [{ FSI_ACCOUNT: 'A001', GEOGRAPHY: 'NA', ROW_COUNT: 3 }],
      1,
    );
  });

  it('opens Required Dimensions with values from the first forecast row', async () => {
    queryRows.mockResolvedValue({
      rows: [
        {
          GEOGRAPHY: 'EMEA',
          BRAND: 'Brand A',
          PROFIT_CENTER: 'PC0001',
          FSI_ACCOUNT: '7210',
          COST_CENTER: 'CC1000',
          COMPANY_CODE: '1163',
        },
      ],
      totalRowCount: 1,
    });
    await renderPage();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Required dimensions' }),
      );
    });

    const dialog = screen.getByRole('dialog', {
      name: 'Required Dimensions',
    });
    expect(within(dialog).getByLabelText('Geo').value).toBe('EMEA');
    expect(within(dialog).getByLabelText('Brand').value).toBe('Brand A');
    expect(within(dialog).getByLabelText('Profit Center').value).toBe('PC0001');
    expect(within(dialog).getByLabelText('FSI').value).toBe('7210');
    expect(within(dialog).getByLabelText('Cost Center').value).toBe('CC1000');
    expect(within(dialog).getByLabelText('Company Code').value).toBe('1163');
    expect(within(dialog).getByLabelText('Geo').disabled).toBe(true);
    expect(queryRows).toHaveBeenCalledWith('Warner Media', {
      startRow: 0,
      endRow: 1,
      sortModel: [],
      filterModel: {},
    });
  });

  it('requests filtered, sorted pages from the server datasource', async () => {
    const props = await renderPage();
    queryRows.mockResolvedValue({ rows: [{ UNIQ_ID: 1 }], totalRowCount: 250 });
    const successCallback = vi.fn();
    const failCallback = vi.fn();
    const params = {
      startRow: 100,
      endRow: 300,
      sortModel: [{ colId: 'NOV_FORECAST', sort: 'desc' }],
      filterModel: {
        COMPANY_CODE: { filterType: 'text', type: 'contains', filter: 'US' },
      },
      successCallback,
      failCallback,
    };

    await props.datasource.getRows(params);

    expect(queryRows).toHaveBeenCalledWith('Warner Media', {
      startRow: 100,
      endRow: 300,
      sortModel: params.sortModel,
      filterModel: params.filterModel,
    });
    expect(successCallback).toHaveBeenCalledWith([{ UNIQ_ID: 1 }], 250);
    expect(failCallback).not.toHaveBeenCalled();
  });

  it('coalesces concurrent duplicate requests for the same forecast page', async () => {
    const props = await renderPage();
    queryRows.mockResolvedValue({ rows: [{ UNIQ_ID: 1 }], totalRowCount: 1 });
    const firstSuccess = vi.fn();
    const secondSuccess = vi.fn();
    const request = {
      startRow: 0,
      endRow: 100,
      sortModel: [],
      filterModel: {},
    };

    await Promise.all([
      props.datasource.getRows({
        ...request,
        successCallback: firstSuccess,
        failCallback: vi.fn(),
      }),
      props.datasource.getRows({
        ...request,
        successCallback: secondSuccess,
        failCallback: vi.fn(),
      }),
    ]);

    expect(queryRows).toHaveBeenCalledOnce();
    expect(firstSuccess).toHaveBeenCalledOnce();
    expect(secondSuccess).toHaveBeenCalledOnce();
  });

  it('keeps unsaved cell edits visible when a server block is reloaded', async () => {
    const props = await renderPage();
    props.onCellValueChanged({ data: { UNIQ_ID: 7, NOV_FORECAST: 999 } });
    queryRows.mockResolvedValue({
      rows: [{ UNIQ_ID: 7, NOV_FORECAST: 100 }],
      totalRowCount: 1,
    });
    const successCallback = vi.fn();

    await props.datasource.getRows({
      startRow: 0,
      endRow: 200,
      sortModel: [],
      filterModel: {},
      successCallback,
      failCallback: vi.fn(),
    });

    expect(successCallback).toHaveBeenCalledWith(
      [{ UNIQ_ID: 7, NOV_FORECAST: 999 }],
      1,
    );
  });

  it('refreshes forecast rows after a successful save', async () => {
    const props = await renderPage();
    const purgeInfiniteCache = vi.fn();
    const applyColumnState = vi.fn();
    const deselectAll = vi.fn();
    props.onGridReady({ api: { purgeInfiniteCache, applyColumnState, deselectAll } });
    act(() => {
      props.onSelectionChanged({ api: { getSelectedRows: () => [{ UNIQ_ID: 7 }] } });
    });
    act(() => {
      props.onCellValueChanged({
        data: { UNIQ_ID: 7, NOV_FORECAST: 999 },
      });
    });
    saveRows.mockResolvedValueOnce({ message: 'Saved 1 row(s).' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save (1)' }));
    });

    expect(saveRows).toHaveBeenCalledWith('Warner Media', [
      { UNIQ_ID: 7, NOV_FORECAST: 999 },
    ]);
    expect(purgeInfiniteCache).toHaveBeenCalledOnce();
    expect(applyColumnState).toHaveBeenCalledWith({
      state: [{ colId: 'UPDATED_TS', sort: 'desc', sortIndex: 0 }],
      defaultState: { sort: null },
    });
    expect(deselectAll).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Bulk update (0)' }).disabled).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);
  });

  it('closes the add-row dialog and reloads the grid after a successful save', async () => {
    const props = await renderPage();
    const purgeInfiniteCache = vi.fn();
    props.onGridReady({ api: { purgeInfiniteCache } });
    saveRows.mockResolvedValueOnce({ message: 'Saved 1 row(s).' });
    fireEvent.click(screen.getByRole('button', { name: 'Insert Row' }));
    const dialog = screen
      .getByRole('heading', { name: 'Add forecast row' })
      .closest('dialog');

    [
      ['Company code', 'US01'],
      ['Profit center', 'P001'],
      ['Cost center', 'C900'],
      ['FSI account', 'A001'],
      ['Geography', 'NA'],
      ['Brand', 'Studio'],
    ].forEach(([label, value]) => {
      fireEvent.change(within(dialog).getByLabelText(new RegExp(label, 'i')), {
        target: { value },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save row' }));
    });

    expect(saveRows).toHaveBeenCalledOnce();
    expect(purgeInfiniteCache).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('heading', { name: 'Add forecast row' }),
    ).toBeNull();
  });
});
