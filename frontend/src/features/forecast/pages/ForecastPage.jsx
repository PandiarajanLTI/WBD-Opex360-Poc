import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import AddForecastRowPanel from '../components/AddForecastRowPanel';
import BulkUpdatePanel from '../components/BulkUpdatePanel';
import { createForecastColumns, MONTH_COLUMNS } from '../models/columns';
import { forecastService } from '../services/forecastService';
import {
  loadColumnState,
  normalizeMovedColumnState,
  saveColumnState,
} from '../utils/columnState';
import { applyPasteToGrid, parseClipboardText } from '../../shared/clipboard';
const PAGE_SIZE = 100;
const CACHE_BLOCK_SIZE = 200;
export default function ForecastPage() {
  const { templateName = '' } = useParams();
  const decodedName = decodeURIComponent(templateName);
  const gridRef = useRef(null);
  const dirtyRowsRef = useRef(new Map());
  const [totalRowCount, setTotalRowCount] = useState(0);
  const [dirtyMap, setDirtyMap] = useState(() => new Map());
  const [rowDialogSeed, setRowDialogSeed] = useState(null);
  const [isAddRowOpen, setIsAddRowOpen] = useState(false);
  const dirtyRows = [...dirtyMap.values()];
  const [metadata, setMetadata] = useState(null);
  const [message, setMessage] = useState('');
  const [selectedCount, setSelectedCount] = useState(0);
  const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
  const columnDefs = useMemo(() => createForecastColumns(), []);
  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      floatingFilter: true,
      suppressHeaderMenuButton: false,
    }),
    [],
  );
  const markDirty = useCallback((row) => {
    dirtyRowsRef.current = new Map(dirtyRowsRef.current).set(row.UNIQ_ID, row);
    setDirtyMap((current) => new Map(current).set(row.UNIQ_ID, row));
  }, []);
  const datasource = useMemo(
    () => ({
      getRows: async (params) => {
        try {
          const result = await forecastService.queryRows(decodedName, {
            startRow: params.startRow,
            endRow: params.endRow,
            sortModel: params.sortModel,
            filterModel: params.filterModel,
          });
          setTotalRowCount(result.totalRowCount);
          const visibleRows = result.rows.map(
            (row) => dirtyRowsRef.current.get(row.UNIQ_ID) ?? row,
          );
          params.successCallback(visibleRows, result.totalRowCount);
        } catch (requestError) {
          setMessage(requestError.message);
          params.failCallback();
        }
      },
    }),
    [decodedName],
  );
  useEffect(() => {
    const controller = new AbortController();
    forecastService
      .getMetadata(decodedName, controller.signal)
      .then(setMetadata)
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [decodedName]);
  const handleCellValueChanged = useCallback(
    ({ data }) => markDirty(data),
    [markDirty],
  );
  const handleGridReady = useCallback(
    ({ api }) => {
      gridRef.current = { api };
      const saved = loadColumnState(decodedName);
      if (saved) {
        const state = saved.map((column) =>
          column.colId === 'BRAND' ? { ...column, hide: false } : column,
        );
        api.applyColumnState({ state, applyOrder: true });
        saveColumnState(decodedName, api.getColumnState());
      }
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
  const duplicateSelected = () => {
    const selected = gridRef.current?.api.getSelectedRows()[0];
    if (!selected) return setMessage('Select one row to duplicate.');
    setRowDialogSeed(selected);
    setIsAddRowOpen(true);
  };
  const handleRowCreated = (notice) => {
    setIsAddRowOpen(false);
    setRowDialogSeed(null);
    setMessage(notice);
    gridRef.current?.api.refreshInfiniteCache();
  };
  const applyBulkUpdate = useCallback(
    (field, value) => {
      const selectedRows = gridRef.current?.api.getSelectedRows() ?? [];
      if (!selectedRows.length) return;
      const selectedNodes = gridRef.current?.api.getSelectedNodes() ?? [];
      selectedNodes.forEach((node) => {
        node.setDataValue(field, value);
        markDirty({ ...node.data, [field]: value });
      });
      setIsBulkUpdateOpen(false);
      setMessage(
        `Applied ${field} to ${selectedRows.length} row(s). Save to persist the changes.`,
      );
    },
    [markDirty],
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
      dirtyRowsRef.current = new Map();
      setDirtyMap(new Map());
      gridRef.current?.api.refreshInfiniteCache();
    } catch (e) {
      setMessage(e.message);
    }
  };
  const handlePaste = (event) => {
    if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
    const api = gridRef.current?.api;
    if (!api) return;
    event.preventDefault();
    const matrix = parseClipboardText(event.clipboardData.getData('text'));
    const changed = applyPasteToGrid(api, matrix);
    setMessage(
      changed.length
        ? `Pasted into ${changed.length} row(s). Save to persist the changes.`
        : 'Nothing pasted. Focus an editable cell (Nov/Dec/Notes) first.',
    );
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
      {isAddRowOpen && (
        <AddForecastRowPanel
          templateName={decodedName}
          version={metadata?.version ?? '10+2'}
          initialData={rowDialogSeed}
          onClose={() => {
            setIsAddRowOpen(false);
            setRowDialogSeed(null);
          }}
          onComplete={handleRowCreated}
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
          <button onClick={() => setIsAddRowOpen(true)}>Add row</button>
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
      <div className="panel grid-panel">
        <div className="ag-theme-quartz grid" onPaste={handlePaste}>
          <AgGridReact
            theme="legacy"
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            rowModelType="infinite"
            datasource={datasource}
            cacheBlockSize={CACHE_BLOCK_SIZE}
            maxBlocksInCache={5}
            pagination
            paginationPageSize={PAGE_SIZE}
            paginationPageSizeSelector={[50, 100, 200]}
            getRowId={({ data }) => String(data.UNIQ_ID)}
            rowSelection={{ mode: 'multiRow', headerCheckbox: false }}
            stopEditingWhenCellsLoseFocus
            suppressDragLeaveHidesColumns
            onGridReady={handleGridReady}
            onCellValueChanged={handleCellValueChanged}
            onSelectionChanged={({ api }) =>
              setSelectedCount(api.getSelectedRows().length)
            }
            onColumnMoved={handleColumnMoved}
          />
        </div>
      </div>
    </>
  );
}
