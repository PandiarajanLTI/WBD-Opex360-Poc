import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import BulkUpdatePanel from '../components/BulkUpdatePanel';
import { createForecastColumns, MONTH_COLUMNS } from '../models/columns';
import { forecastService } from '../services/forecastService';
import { useForecastGrid } from '../hooks/useForecastGrid';
import {
  loadColumnState,
  normalizeMovedColumnState,
  saveColumnState,
} from '../utils/columnState';
const PAGE_SIZE = 100;
export default function ForecastPage() {
  const { templateName = '' } = useParams();
  const decodedName = decodeURIComponent(templateName);
  const gridRef = useRef(null);
  const tempId = useRef(-1);
  const {
    rows,
    totalRowCount,
    isLoading,
    error,
    dirtyRows,
    loadRows,
    markDirty,
    clearDirty,
    setState,
  } = useForecastGrid(decodedName);
  const [metadata, setMetadata] = useState(null);
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(0);
  const [selectedCount, setSelectedCount] = useState(0);
  const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
  const columnDefs = useMemo(() => createForecastColumns(), []);
  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      suppressHeaderMenuButton: false,
    }),
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    forecastService
      .getMetadata(decodedName, controller.signal)
      .then(setMetadata)
      .catch((e) => setMessage(e.message));
    return () => controller.abort();
  }, [decodedName]);
  const requestPage = useCallback(
    (nextPage, api = gridRef.current?.api) => {
      const startRow = nextPage * PAGE_SIZE;
      const sortModel =
        api
          ?.getColumnState()
          .filter((c) => c.sort)
          .map((c) => ({ colId: c.colId, sort: c.sort })) ?? [];
      const filterModel = api?.getFilterModel() ?? {};
      setPage(nextPage);
      loadRows({
        startRow,
        endRow: startRow + PAGE_SIZE,
        sortModel,
        filterModel,
      });
    },
    [loadRows],
  );
  const handleCellValueChanged = useCallback(
    ({ data }) => markDirty(data),
    [markDirty],
  );
  const handleGridReady = useCallback(
    ({ api }) => {
      gridRef.current = { api };
      const saved = loadColumnState(decodedName);
      if (saved) api.applyColumnState({ state: saved, applyOrder: true });
    },
    [decodedName],
  );
  const handleColumnMoved = useCallback(
    ({ api, column, finished }) => {
      if (!finished || !column) return;
      const state = normalizeMovedColumnState(
        api.getColumnState(),
        column.getColId(),
        MONTH_COLUMNS.map((m) => `${m}_FORECAST`),
      );
      api.applyColumnState({ state, applyOrder: true });
      saveColumnState(decodedName, api.getColumnState());
    },
    [decodedName],
  );
  const insertFive = () => {
    const additions = Array.from({ length: 5 }, () => ({
      UNIQ_ID: tempId.current--,
      TEMPLATE_NAME: decodedName,
      VERSION: metadata?.version ?? '10+2',
      NOV_FORECAST: 0,
      DEC_FORECAST: 0,
      INSERTED: 'Y',
    }));
    setState((current) => ({
      ...current,
      rows: [...additions, ...current.rows],
    }));
    additions.forEach(markDirty);
  };
  const duplicateSelected = () => {
    const selected = gridRef.current?.api.getSelectedRows()[0];
    if (!selected) return setMessage('Select one row to duplicate.');
    const copy = { ...selected, UNIQ_ID: tempId.current--, INSERTED: 'Y' };
    setState((current) => ({ ...current, rows: [copy, ...current.rows] }));
    markDirty(copy);
  };
  const applyBulkUpdate = useCallback(
    (field, value) => {
      const selectedRows = gridRef.current?.api.getSelectedRows() ?? [];
      if (!selectedRows.length) return;
      const selectedIds = new Set(selectedRows.map((row) => row.UNIQ_ID));
      const updatedRows = rows.map((row) =>
        selectedIds.has(row.UNIQ_ID) ? { ...row, [field]: value } : row,
      );
      setState((current) => ({ ...current, rows: updatedRows }));
      updatedRows
        .filter((row) => selectedIds.has(row.UNIQ_ID))
        .forEach(markDirty);
      setIsBulkUpdateOpen(false);
      setMessage(
        `Applied ${field} to ${selectedRows.length} row(s). Save to persist the changes.`,
      );
    },
    [markDirty, rows, setState],
  );
  const save = async () => {
    if (!dirtyRows.length) return;
    if (
      dirtyRows.some(
        (row) =>
          row.INSERTED === 'Y' &&
          Number(row.NOV_FORECAST ?? 0) === 0 &&
          Number(row.DEC_FORECAST ?? 0) === 0,
      ) &&
      !window.confirm(
        'One or more inserted rows contain zero forecast values. Save anyway?',
      )
    )
      return;
    try {
      const result = await forecastService.saveRows(decodedName, dirtyRows);
      setMessage(result.message);
      clearDirty();
      requestPage(page);
    } catch (e) {
      setMessage(e.message);
    }
  };
  const resetLayout = () => {
    localStorage.removeItem(`opex360:grid:${decodedName}`);
    gridRef.current?.api.resetColumnState();
  };
  return (
    <>
      {isBulkUpdateOpen && (
        <BulkUpdatePanel
          selectedCount={selectedCount}
          onApply={applyBulkUpdate}
          onClose={() => setIsBulkUpdateOpen(false)}
        />
      )}
      <div className="page-heading">
        <div>
          <h1>{decodedName}</h1>
          <p>
            {metadata?.version} • {metadata?.status} •{' '}
            {totalRowCount.toLocaleString()} records
          </p>
        </div>
        <div className="actions">
          <button onClick={insertFive}>Insert 5 rows</button>
          <button onClick={duplicateSelected}>Duplicate</button>
          <button
            disabled={!selectedCount}
            onClick={() => setIsBulkUpdateOpen(true)}
          >
            Bulk update ({selectedCount})
          </button>
          <button onClick={resetLayout}>Reset layout</button>
          <button onClick={() => forecastService.exportRows(decodedName)}>
            Export
          </button>
          <button
            className="primary"
            disabled={!dirtyRows.length}
            onClick={save}
          >
            Save {dirtyRows.length || ''}
          </button>
        </div>
      </div>
      {metadata && (
        <div className="kpis">
          {Object.entries(metadata.kpis).map(([label, value]) => (
            <div className="kpi" key={label}>
              <small>{label}</small>
              <strong>{Number(value).toLocaleString()}</strong>
            </div>
          ))}
        </div>
      )}
      {message && <div className="notice">{message}</div>}
      {error && <div className="error">{error}</div>}
      <div className="panel grid-panel">
        <div className="ag-theme-quartz grid">
          <AgGridReact
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={({ data }) => String(data.UNIQ_ID)}
            rowSelection={{ mode: 'multiRow' }}
            loading={isLoading}
            stopEditingWhenCellsLoseFocus
            onGridReady={handleGridReady}
            onCellValueChanged={handleCellValueChanged}
            onSelectionChanged={({ api }) =>
              setSelectedCount(api.getSelectedRows().length)
            }
            onColumnMoved={handleColumnMoved}
            onSortChanged={() => requestPage(0)}
            onFilterChanged={() => requestPage(0)}
          />
        </div>
        <div className="pager">
          <button disabled={page === 0} onClick={() => requestPage(page - 1)}>
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            disabled={(page + 1) * PAGE_SIZE >= totalRowCount}
            onClick={() => requestPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
