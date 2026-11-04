import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import AddForecastRowPanel from '../components/AddForecastRowPanel';
import BulkUpdatePanel from '../components/BulkUpdatePanel';
import CreateForecastViewPanel from '../components/CreateForecastViewPanel';
import RequiredDimensionsDialog from '../components/RequiredDimensionsDialog';
import { createForecastColumns, MONTH_COLUMNS } from '../models/columns';
import { forecastService } from '../services/forecastService';
import {
  limitPinnedDescriptorColumns,
  loadColumnState,
  normalizeMovedColumnState,
  saveColumnState,
} from '../utils/columnState';
import { applyPasteToGrid, parseClipboardText } from '../../shared/clipboard';
const PAGE_SIZE = 100;
const CACHE_BLOCK_SIZE = 200;
const SUMMARY_COLUMN_DEFS = [
  {
    field: 'FSI_ACCOUNT',
    colId: 'FSI_ACCOUNT',
    headerName: 'FSI Account',
    filter: false,
    minWidth: 180,
  },
  {
    field: 'GEOGRAPHY',
    colId: 'GEOGRAPHY',
    headerName: 'Region',
    filter: false,
    minWidth: 180,
  },
  {
    field: 'FY_WORKING_FORECAST',
    colId: 'FY_WORKING_FORECAST',
    headerName: 'FY Forecast',
    type: 'numericColumn',
    filter: false,
    valueFormatter: ({ value }) => currency.format(Number(value ?? 0)),
    minWidth: 180,
  },
  {
    field: 'ROW_COUNT',
    colId: 'ROW_COUNT',
    headerName: 'Records',
    type: 'numericColumn',
    filter: false,
    minWidth: 130,
  },
];
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
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
  const [visibleColumnIds, setVisibleColumnIds] = useState(() =>
    columnDefs.map((column) => column.colId),
  );
  const [isFieldPickerOpen, setIsFieldPickerOpen] = useState(false);
  const [isRequiredDimensionsOpen, setIsRequiredDimensionsOpen] =
    useState(false);
  const [requiredDimensions, setRequiredDimensions] = useState(null);
  const [isRequiredDimensionsLoading, setIsRequiredDimensionsLoading] =
    useState(false);
  const [requiredDimensionsError, setRequiredDimensionsError] = useState('');
  const [viewMode, setViewMode] = useState('detail');
  const [activeLayoutView, setActiveLayoutView] = useState('full');
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isCreateViewOpen, setIsCreateViewOpen] = useState(false);
  const [customViews, setCustomViews] = useState([]);
  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      floatingFilter: false,
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
  const summaryDatasource = useMemo(
    () => ({
      getRows: async (params) => {
        try {
          const result = await forecastService.querySummaryRows(decodedName, {
            startRow: params.startRow,
            endRow: params.endRow,
            sortModel: params.sortModel,
            filterModel: params.filterModel,
          });
          setTotalRowCount(result.totalRowCount);
          params.successCallback(result.rows, result.totalRowCount);
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
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(`opex360:views:${decodedName}`) ?? '[]',
      );
      if (!Array.isArray(saved)) {
        throw new Error('Saved forecast views are not in a valid format.');
      }
      const availableColumnIds = new Set(
        columnDefs.map((column) => column.colId),
      );
      const views = saved.map((view) => {
        if (
          !view ||
          typeof view.id !== 'string' ||
          typeof view.name !== 'string' ||
          !Array.isArray(view.columnIds) ||
          !view.columnIds.every((columnId) => availableColumnIds.has(columnId))
        ) {
          throw new Error('Saved forecast views are not in a valid format.');
        }
        return view;
      });
      setCustomViews(views);
    } catch (error) {
      setMessage(`Unable to load saved forecast views: ${error.message}`);
    }
  }, [columnDefs, decodedName]);
  const handleCellValueChanged = useCallback(
    ({ data }) => markDirty(data),
    [markDirty],
  );
  const handleGridReady = useCallback(
    ({ api }) => {
      gridRef.current = { api };
      const saved = loadColumnState(decodedName);
      if (saved) {
        const state = limitPinnedDescriptorColumns(saved).map((column) =>
          column.colId === 'BRAND' ? { ...column, hide: false } : column,
        );
        api.applyColumnState({ state, applyOrder: true });
        saveColumnState(decodedName, api.getColumnState());
      }
      const currentState =
        api.getColumnState?.() ??
        columnDefs.map(({ colId }) => ({ colId, hide: false }));
      setVisibleColumnIds(
        currentState
          .filter((column) => !column.hide)
          .map((column) => column.colId),
      );
    },
    [columnDefs, decodedName],
  );
  const handleColumnVisible = useCallback(
    ({ api }) => {
      const state = api.getColumnState();
      setVisibleColumnIds(
        state.filter((column) => !column.hide).map((column) => column.colId),
      );
      saveColumnState(decodedName, state);
    },
    [decodedName],
  );
  const handleFieldToggle = (field, isVisible) => {
    gridRef.current?.api.setColumnsVisible([field], isVisible);
  };
  const applyLayoutView = (viewId, columnIds) => {
    setActiveLayoutView(viewId);
    setIsViewMenuOpen(false);
    if (viewId === 'summary') return;
    const allColumnIds = columnDefs.map((column) => column.colId);
    const visibleIds = columnIds ?? allColumnIds;
    gridRef.current?.api.setColumnsVisible(allColumnIds, false);
    gridRef.current?.api.setColumnsVisible(visibleIds, true);
  };
  const saveCustomView = (name, columnIds) => {
    const newView = {
      id: `custom-${Date.now()}`,
      name,
      columnIds,
    };
    const nextViews = [...customViews, newView];
    try {
      localStorage.setItem(
        `opex360:views:${decodedName}`,
        JSON.stringify(nextViews),
      );
    } catch (error) {
      setMessage(`Unable to save this view: ${error.message}`);
      return;
    }
    setCustomViews(nextViews);
    setIsCreateViewOpen(false);
    applyLayoutView(newView.id, columnIds);
  };
  const openRequiredDimensions = async () => {
    setIsRequiredDimensionsOpen(true);
    setIsRequiredDimensionsLoading(true);
    setRequiredDimensionsError('');
    try {
      const api = gridRef.current?.api;
      const row =
        api?.getSelectedRows?.()[0] ?? api?.getDisplayedRowAtIndex?.(0)?.data;
      if (row) {
        setRequiredDimensions(row);
        return;
      }
      const result = await forecastService.queryRows(decodedName, {
        startRow: 0,
        endRow: 1,
        sortModel: [],
        filterModel: {},
      });
      if (!result.rows.length) {
        throw new Error('No forecast rows are available for this template.');
      }
      setRequiredDimensions(result.rows[0]);
    } catch (error) {
      setRequiredDimensionsError(error.message);
    } finally {
      setIsRequiredDimensionsLoading(false);
    }
  };
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
    setActiveLayoutView('full');
  };
  const handleExport = async () => {
    try {
      await forecastService.exportRows(decodedName);
    } catch (error) {
      setMessage(error.message);
    }
  };
  const summaryToKpiView = () => {
    setViewMode('kpi');
    document.getElementById('forecast-kpis')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  };
  const kpis = Object.entries(metadata?.kpis ?? {});
  const priorForecast = Number(
    kpis.find(([label]) => label.toLowerCase().includes('prior'))?.[1] ?? 0,
  );
  return (
    <div className="forecast-dashboard forecast-detail-dashboard">
      {isBulkUpdateOpen && (
        <BulkUpdatePanel
          selectedCount={selectedCount}
          onApply={applyBulkUpdate}
          onClose={() => setIsBulkUpdateOpen(false)}
        />
      )}
      {isCreateViewOpen && (
        <CreateForecastViewPanel
          columns={columnDefs}
          initialColumnIds={visibleColumnIds}
          onClose={() => setIsCreateViewOpen(false)}
          onSave={saveCustomView}
        />
      )}
      {isRequiredDimensionsOpen && (
        <RequiredDimensionsDialog
          error={requiredDimensionsError}
          isLoading={isRequiredDimensionsLoading}
          onClose={() => setIsRequiredDimensionsOpen(false)}
          values={requiredDimensions}
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
      <div className="forecast-page-heading">
        <div className="forecast-title-group">
          <Link className="back-to-library" to="/">
            <span aria-hidden="true">←</span> Back to Library
          </Link>
          <div className="forecast-title">
            <h1>{decodedName}</h1>
            {metadata?.status && (
              <span className="status-pill">{metadata.status}</span>
            )}
          </div>
          <p>
            {metadata?.version ?? 'Forecast'} forecast
            <span aria-hidden="true"> | </span>
            {totalRowCount.toLocaleString()} records
          </p>
        </div>
        <div className="forecast-heading-actions">
          <button
            className="kpi-view-button"
            onClick={summaryToKpiView}
            type="button"
          >
            Click here to check KPI&apos;s view
          </button>
          <details
            className="view-selector"
            onToggle={(event) => setIsViewMenuOpen(event.currentTarget.open)}
            open={isViewMenuOpen}
          >
            <summary aria-label="Select forecast view">
              ▤ &nbsp;{' '}
              {activeLayoutView === 'summary'
                ? 'Summarized by FSI, Region'
                : (customViews.find((view) => view.id === activeLayoutView)
                    ?.name ?? 'Detail View')}
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="view-selector-menu">
              <button
                className="view-option"
                onClick={() => {
                  setViewMode('detail');
                  applyLayoutView('full');
                }}
                type="button"
              >
                <span>▤ &nbsp; Detail View (Full)</span>
                {activeLayoutView === 'full' && (
                  <span className="active-view-badge">Active</span>
                )}
              </button>
              <button
                className="view-option"
                onClick={() => {
                  setViewMode('detail');
                  applyLayoutView('summary');
                }}
                type="button"
              >
                <span>▤ &nbsp; Summarized by FSI, Region</span>
                {activeLayoutView === 'summary' && (
                  <span className="active-view-badge">Active</span>
                )}
              </button>
              {customViews.map((view) => (
                <button
                  className="view-option"
                  key={view.id}
                  onClick={() => {
                    setViewMode('detail');
                    applyLayoutView(view.id, view.columnIds);
                  }}
                  type="button"
                >
                  <span>▤ &nbsp; {view.name}</span>
                  {activeLayoutView === view.id && (
                    <span className="active-view-badge">Active</span>
                  )}
                </button>
              ))}
              <button
                className="view-option create-view-option"
                onClick={() => {
                  setIsViewMenuOpen(false);
                  setIsCreateViewOpen(true);
                }}
                type="button"
              >
                ＋ Create New View
              </button>
            </div>
          </details>
          <button
            aria-expanded={isRequiredDimensionsOpen}
            aria-label="Required dimensions"
            className="icon-action"
            onClick={openRequiredDimensions}
            title="Required dimensions"
            type="button"
          >
            i
          </button>
          <button
            aria-label="Team collaboration"
            className="icon-action"
            onClick={() =>
              setMessage(
                'Team collaboration is not configured in this workspace.',
              )
            }
            title="Team collaboration"
            type="button"
          >
            ♧
          </button>
          <button
            aria-label="Download forecast"
            className="icon-action"
            onClick={handleExport}
            title="Download forecast"
            type="button"
          >
            ↓
          </button>
          <button
            className="primary"
            disabled={!dirtyRows.length}
            onClick={save}
            type="button"
          >
            Save{dirtyRows.length ? ` (${dirtyRows.length})` : ''}
          </button>
          <button
            className="submit-forecast-button"
            onClick={() =>
              setMessage('EPM submission is not configured in this workspace.')
            }
            type="button"
            style={{ display: 'none' }}
          >
            Summarize &amp; Submit to EPM
          </button>
        </div>
      </div>
      <section
        aria-label="Forecast summary"
        className="forecast-kpi-panel"
        id="forecast-kpis"
      >
        <div className="forecast-kpis">
          {kpis.map(([label, value], index) => {
            const isVariance = label.toLowerCase().includes('variance');
            const numericValue = Number(value);
            const description = isVariance
              ? priorForecast
                ? `${((numericValue / priorForecast) * 100).toFixed(1)}% vs Prior`
                : 'Compared with prior forecast'
              : label.toLowerCase().includes('prior')
                ? 'Previous forecast period'
                : `${totalRowCount.toLocaleString()} records`;
            return (
              <article className="forecast-kpi-card" key={label}>
                <div>
                  <span>{label}</span>
                  <strong>
                    {isVariance && numericValue > 0 ? '+' : ''}
                    {currency.format(numericValue)}
                  </strong>
                  <small>{description}</small>
                </div>
                <span
                  aria-hidden="true"
                  className={`forecast-kpi-icon forecast-kpi-icon-${index}`}
                >
                  {index === 0 ? '▥' : index === 1 ? '⌁' : '☷'}
                </span>
              </article>
            );
          })}
        </div>
      </section>
      {message && <div className="notice">{message}</div>}
      {viewMode === 'detail' && (
        <section
          aria-labelledby="forecast-template-title"
          className="grid-card"
        >
          <div className="grid-toolbar">
            <div className="grid-title-group">
              <h2 id="forecast-template-title">
                {activeLayoutView === 'summary'
                  ? 'Summarized by FSI, Region'
                  : 'Forecast Template'}
              </h2>
              <span>{totalRowCount.toLocaleString()} Records</span>
            </div>
            <div className="grid-toolbar-actions">
              {activeLayoutView !== 'summary' && (
                <>
                  <details
                    className="field-picker"
                    onToggle={(event) =>
                      setIsFieldPickerOpen(event.currentTarget.open)
                    }
                    open={isFieldPickerOpen}
                  >
                    <summary>☷ &nbsp; Select Fields</summary>
                    <div className="field-picker-menu">
                      {columnDefs.map((column) => (
                        <label key={column.colId}>
                          <input
                            checked={visibleColumnIds.includes(column.colId)}
                            onChange={(event) =>
                              handleFieldToggle(
                                column.colId,
                                event.target.checked,
                              )
                            }
                            type="checkbox"
                          />
                          {column.headerName}
                        </label>
                      ))}
                    </div>
                  </details>
                  <button
                    className="insert-row-button"
                    onClick={() => setIsAddRowOpen(true)}
                    type="button"
                  >
                    <span aria-hidden="true">＋</span> Insert Row
                  </button>
                </>
              )}
              <details className="more-actions">
                <summary>More</summary>
                <div className="more-actions-menu">
                  {activeLayoutView !== 'summary' && (
                    <>
                      <button onClick={duplicateSelected} type="button">
                        Duplicate selected row
                      </button>
                      <button
                        disabled={!selectedCount}
                        onClick={() => setIsBulkUpdateOpen(true)}
                        type="button"
                      >
                        Bulk update ({selectedCount})
                      </button>
                    </>
                  )}
                  <button onClick={resetLayout} type="button">
                    Reset layout
                  </button>
                  <button onClick={handleExport} type="button">
                    Export forecast
                  </button>
                </div>
              </details>
            </div>
          </div>
          <div className="ag-theme-quartz grid" onPaste={handlePaste}>
            <AgGridReact
              theme="legacy"
              columnDefs={
                activeLayoutView === 'summary'
                  ? SUMMARY_COLUMN_DEFS
                  : columnDefs
              }
              defaultColDef={defaultColDef}
              rowModelType="infinite"
              datasource={
                activeLayoutView === 'summary' ? summaryDatasource : datasource
              }
              cacheBlockSize={CACHE_BLOCK_SIZE}
              maxBlocksInCache={5}
              pagination
              paginationPageSize={PAGE_SIZE}
              paginationPageSizeSelector={[50, 100, 200]}
              getRowId={({ data }) =>
                String(
                  data.UNIQ_ID ??
                    `${data.FSI_ACCOUNT ?? ''}:${data.GEOGRAPHY ?? ''}`,
                )
              }
              rowSelection={
                activeLayoutView === 'summary'
                  ? undefined
                  : { mode: 'multiRow', headerCheckbox: false }
              }
              readOnlyEdit={activeLayoutView === 'summary'}
              stopEditingWhenCellsLoseFocus
              suppressDragLeaveHidesColumns
              onGridReady={handleGridReady}
              onCellValueChanged={
                activeLayoutView === 'summary'
                  ? undefined
                  : handleCellValueChanged
              }
              onSelectionChanged={({ api }) =>
                setSelectedCount(api.getSelectedRows().length)
              }
              onColumnMoved={handleColumnMoved}
              onColumnVisible={handleColumnVisible}
            />
          </div>
          <div className="grid-footer">
            Showing {totalRowCount.toLocaleString()} records
            <span>•</span>
            Select rows to duplicate or bulk update
          </div>
        </section>
      )}
    </div>
  );
}
