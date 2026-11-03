// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForecastPage from './ForecastPage';

const { grid } = vi.hoisted(() => ({ grid: vi.fn(() => null) }));

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
    expect(props.columnDefs.find((column) => column.colId === 'BRAND')).toEqual(
      expect.objectContaining({ suppressMovable: false }),
    );
  });
});
