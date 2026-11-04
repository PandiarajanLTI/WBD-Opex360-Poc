// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForecastPage from './ForecastPage';

const { grid, queryRows } = vi.hoisted(() => ({
  grid: vi.fn(() => null),
  queryRows: vi.fn(),
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
    getMetadata: () => Promise.resolve(null),
    queryRows,
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
  it('restores a saved hidden Brand without resetting the rest of the layout', async () => {
    const saved = [
      { colId: 'NOTES', pinned: 'left', width: 240, hide: false },
      { colId: 'BRAND', pinned: null, width: 180, hide: true },
      { colId: 'VERSION', pinned: 'left', width: 150, hide: true },
    ];
    localStorage.setItem('opex360:grid:Warner Media', JSON.stringify(saved));
    const props = await renderPage();
    const restored = saved.map((column) =>
      column.colId === 'BRAND' ? { ...column, hide: false } : column,
    );
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
    expect(props.pagination).toBe(true);
    expect(props.paginationPageSize).toBe(100);
    expect(
      props.columnDefs.find((column) => column.colId === 'NOV_FORECAST').filter,
    ).toBe('agNumberColumnFilter');
    expect(props.columnDefs.find((column) => column.colId === 'BRAND')).toEqual(
      expect.objectContaining({ suppressMovable: false }),
    );
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
});
