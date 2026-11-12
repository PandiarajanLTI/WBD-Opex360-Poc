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

vi.mock('../components/ForecastGrid', () => ({ default: grid }));
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
  it('applies and removes a calculated NOV formula', async () => {
    const props = await renderPage();
    const api = {
      applyColumnState: vi.fn(),
      getFilterModel: vi.fn(() => ({ NOV_FORECAST: { filter: 5 }, BRAND: { filter: 'A' } })),
      setFilterModel: vi.fn(),
    };
    act(() => props.onGridReady({ api }));
    fireEvent.click(screen.getByRole('button', { name: 'Set NOV formula' }));
    fireEvent.change(screen.getByLabelText('Formula'), { target: { value: 'OCT_FORECAST * 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply formula' }));

    const column = grid.mock.lastCall[0].columnDefs.find(({ field }) => field === 'NOV_FORECAST');
    const row = { NOV_FORECAST: 99, OCT_FORECAST: 12 };
    expect(column.valueGetter({ data: row })).toBe(24);
    row.OCT_FORECAST = 15;
    expect(column.valueGetter({ data: row })).toBe(30);
    expect(row.NOV_FORECAST).toBe(99);
    expect(column.editable({ data: row })).toBe(false);
    expect(column.sortable).toBe(false);
    expect(column.filter).toBe(false);
    expect(api.setFilterModel).toHaveBeenCalledWith({ BRAND: { filter: 'A' } });
    expect(localStorage.getItem('opex360:nov-formula:Warner Media')).toBe('OCT_FORECAST * 2');
    expect(screen.getByRole('status').textContent).toContain('Formula changes alone do not enable Save');
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Edit NOV formula' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove formula' }));
    expect(localStorage.getItem('opex360:nov-formula:Warner Media')).toBeNull();
    expect(grid.mock.lastCall[0].columnDefs.find(({ field }) => field === 'NOV_FORECAST').filter).toBe('agNumberColumnFilter');
  });

  it('restores a formula and rejects invalid expressions without replacing it', async () => {
    localStorage.setItem('opex360:nov-formula:Warner Media', 'DEC_FORECAST + 5');
    const props = await renderPage();
    expect(props.columnDefs.find(({ field }) => field === 'NOV_FORECAST').valueGetter({ data: { DEC_FORECAST: 4 } })).toBe(9);
    fireEvent.click(screen.getByRole('button', { name: 'Edit NOV formula' }));
    fireEvent.change(screen.getByLabelText('Formula'), { target: { value: 'NOV_FORECAST + 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply formula' }));
    expect(screen.getByRole('alert').textContent).toContain('NOV_FORECAST');
    expect(localStorage.getItem('opex360:nov-formula:Warner Media')).toBe('DEC_FORECAST + 5');
  });

  it('saves calculated NOV for all template pages and merges pending edits', async () => {
    const props = await renderPage();
    const api = { purgeInfiniteCache: vi.fn(), applyColumnState: vi.fn(), deselectAll: vi.fn() };
    act(() => props.onGridReady({ api }));
    fireEvent.click(screen.getByRole('button', { name: 'Set NOV formula' }));
    fireEvent.change(screen.getByLabelText('Formula'), { target: { value: 'OCT_FORECAST + DEC_FORECAST' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply formula' }));
    act(() => props.onCellValueChanged({
      data: { UNIQ_ID: 1, OCT_FORECAST: 10, DEC_FORECAST: 8, NOTES: 'edited', CURRENCY: 'USD' },
      colDef: { field: 'DEC_FORECAST' },
    }));
    queryRows.mockImplementation(async (_name, request) => ({
      totalRowCount: 501,
      rows: Array.from({ length: request.startRow === 0 ? 500 : 1 }, (_, index) => ({
        UNIQ_ID: request.startRow + index + 1, OCT_FORECAST: 10, DEC_FORECAST: 2, CURRENCY: 'USD',
      })),
    }));
    saveRows.mockResolvedValueOnce({ saved: 501, message: 'Updated 501 row(s).' });

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save (1)' })));

    expect(queryRows).toHaveBeenCalledTimes(2);
    expect(queryRows.mock.calls[0][1]).toEqual({ startRow: 0, endRow: 500, sortModel: [{ colId: 'UNIQ_ID', sort: 'asc' }], filterModel: {} });
    expect(queryRows.mock.calls[1][1].startRow).toBe(500);
    expect(saveRows).toHaveBeenCalledOnce();
    const [name, rows] = saveRows.mock.calls[0];
    expect(name).toBe('Warner Media');
    expect(rows).toHaveLength(501);
    expect(rows[0]).toMatchObject({ UNIQ_ID: 1, NOV_FORECAST: 18, DEC_FORECAST: 8, NOTES: 'edited' });
    expect(rows[0].__editedFields).toBeUndefined();
    expect(rows[500]).toEqual({ UNIQ_ID: 501, CURRENCY: 'USD', NOV_FORECAST: 12 });
    expect(api.purgeInfiniteCache).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);
    expect(localStorage.getItem('opex360:nov-formula-pending:Warner Media')).toBe('0');
  });

  it('blocks invalid calculations and retains pending changes for retry', async () => {
    const props = await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Set NOV formula' }));
    fireEvent.change(screen.getByLabelText('Formula'), { target: { value: 'OCT_FORECAST / DEC_FORECAST' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply formula' }));
    act(() => props.onCellValueChanged({ data: { UNIQ_ID: 1, OCT_FORECAST: 5, DEC_FORECAST: 0 }, colDef: { field: 'DEC_FORECAST' } }));
    queryRows.mockResolvedValueOnce({ rows: [{ UNIQ_ID: 1, OCT_FORECAST: 5, DEC_FORECAST: 0 }], totalRowCount: 1 });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save (1)' })));
    expect(saveRows).not.toHaveBeenCalled();
    expect(screen.getByText(/Cannot calculate NOV for row 1/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save (1)' }).disabled).toBe(false);
    expect(localStorage.getItem('opex360:nov-formula-pending:Warner Media')).toBe('1');
  });

  it('retains pending formula and edits when the save API fails', async () => {
    const props = await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Set NOV formula' }));
    fireEvent.change(screen.getByLabelText('Formula'), { target: { value: 'OCT_FORECAST * 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply formula' }));
    act(() => props.onCellValueChanged({ data: { UNIQ_ID: 1, OCT_FORECAST: 5, NOTES: 'pending' }, colDef: { field: 'NOTES' } }));
    queryRows.mockResolvedValueOnce({ rows: [{ UNIQ_ID: 1, OCT_FORECAST: 5 }], totalRowCount: 1 });
    saveRows.mockRejectedValueOnce(new Error('Database unavailable'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save (1)' })));
    expect(screen.getByText('Database unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save (1)' }).disabled).toBe(false);
    expect(localStorage.getItem('opex360:nov-formula-pending:Warner Media')).toBe('1');
  });

  it('recalculates NOV for subsequent edited rows without saving the whole template', async () => {
    localStorage.setItem('opex360:nov-formula:Warner Media', 'DEC_FORECAST * 2');
    localStorage.setItem('opex360:nov-formula-pending:Warner Media', '0');
    const props = await renderPage();
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);
    act(() => props.onCellValueChanged({ data: { UNIQ_ID: 7, DEC_FORECAST: 5, NOV_FORECAST: 1 }, colDef: { field: 'DEC_FORECAST' } }));
    saveRows.mockResolvedValueOnce({ saved: 1, message: 'Updated 1 row(s).' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save (1)' })));
    expect(queryRows).not.toHaveBeenCalled();
    expect(saveRows).toHaveBeenCalledWith('Warner Media', [{ UNIQ_ID: 7, DEC_FORECAST: 5, NOV_FORECAST: 10 }]);
  });

  it('restores an unsaved formula after reload and reports a short backend save', async () => {
    localStorage.setItem('opex360:nov-formula:Warner Media', 'OCT_FORECAST + 1');
    localStorage.setItem('opex360:nov-formula-pending:Warner Media', '1');
    const props = await renderPage();
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);
    act(() => props.onCellValueChanged({ data: { UNIQ_ID: 1, OCT_FORECAST: 10, NOTES: 'edited' }, colDef: { field: 'NOTES' } }));
    queryRows.mockResolvedValueOnce({ rows: [{ UNIQ_ID: 1, OCT_FORECAST: 10 }], totalRowCount: 1 });
    saveRows.mockResolvedValueOnce({ saved: 0, message: 'Updated 0 row(s).' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save (1)' })));
    expect(screen.getByText(/server saved 0 of 1 requested rows/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save (1)' }).disabled).toBe(false);
    expect(localStorage.getItem('opex360:nov-formula-pending:Warner Media')).toBe('1');
  });

  it('keeps metadata descriptors scrollable with a visible horizontal scrollbar', async () => {
    getMetadata.mockResolvedValueOnce({
      columns: ['TEMPLATE_NAME', 'DER_PROJECT_NAME', 'CURRENCY', 'AGG_TYPE'],
      kpis: {},
    });

    const props = await renderPage();

    expect(props.alwaysShowHorizontalScroll).toBe(true);
    expect(props.columnDefs.slice(0, 17).map((column) => column.colId)).toEqual([
      'TEMPLATE_NAME', 'VERSION', 'COMPANY_CODE', 'BRAND', 'GEOGRAPHY',
      'COST_CENTER', 'PROFIT_CENTER', 'CURRENCY', 'REPORTABLE', 'BUSINESS_UNIT',
      'DER_VENDOR_NAME', 'DER_PROJECT_NAME', 'DER_INTERNAL_ORDER_ID',
      'DER_PURCHASE_ORDER', 'FORECAST_DRIVER_ID', 'AGG_TYPE', 'FSI_ACCOUNT',
    ]);
    expect(
      props.columnDefs.filter((column) => column.pinned === 'left').map(
        (column) => column.colId,
      ),
    ).toEqual(props.columnDefs.slice(0, 17).map((column) => column.colId));
    for (const field of ['DER_PROJECT_NAME', 'CURRENCY', 'AGG_TYPE']) {
      expect(props.columnDefs.find((column) => column.colId === field)).toEqual(
        expect.objectContaining({ pinned: 'left', lockPinned: true }),
      );
      expect(props.columnDefs.findIndex((column) => column.colId === field)).toBeLessThan(
        props.columnDefs.findIndex((column) => column.colId === 'JAN_FORECAST'),
      );
    }
  });

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

  it('restores required descriptors in order without losing saved widths', async () => {
    const saved = [
      { colId: 'TEMPLATE_NAME', pinned: 'left', width: 150, hide: false },
      { colId: 'NOTES', pinned: 'left', width: 240, hide: false },
      { colId: 'BRAND', pinned: null, width: 180, hide: true },
      { colId: 'VERSION', pinned: 'left', width: 150, hide: true },
    ];
    localStorage.setItem('opex360:grid:Warner Media', JSON.stringify(saved));
    const props = await renderPage();
    const restored = props.columnDefs
      .filter((column) => column.context?.columnType === 'descriptor')
      .map((column) => ({
        ...saved.find((entry) => entry.colId === column.colId),
        colId: column.colId,
        ...(column.lockPinned ? { hide: false } : {}),
        pinned: column.lockPinned ? 'left' : null,
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
      expect.objectContaining({ suppressMovable: true }),
    );
    expect(
      props.columnDefs.filter((column) => column.pinned === 'left'),
    ).toHaveLength(17);
    expect(
      props.columnDefs.find((column) => column.colId === 'COMPANY_CODE').pinned,
    ).toBe('left');
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
