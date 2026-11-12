import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ForecastGrid from '../components/ForecastGrid';
import AddForecastRowPanel from '../components/AddForecastRowPanel';
import BulkUpdatePanel from '../components/BulkUpdatePanel';
import CreateForecastViewPanel from '../components/CreateForecastViewPanel';
import RequiredDimensionsDialog from '../components/RequiredDimensionsDialog';
import NovFormulaDialog from '../components/NovFormulaDialog';
import { createForecastColumns, MONTH_COLUMNS } from '../models/columns';
import { compileForecastFormula } from '../utils/formula';
import { buildNovFormulaPayload, calculateDirtyNovRows } from '../utils/saveNovFormula';
import SelectAllRowsHeader from '../../shared/SelectAllRowsHeader';
import { forecastService } from '../services/forecastService';
import {
  limitPinnedDescriptorColumns,
  loadColumnState,
  normalizeMovedColumnState,
  orderDescriptorColumnsFirst,
  saveColumnState,
} from '../utils/columnState';
import {
  applyPasteToGrid,
  createRowsFromFullRowPaste,
  isFullRowPaste,
  parseClipboardText,
} from '../../shared/clipboard';
const PAGE_SIZE = 100;
const CACHE_BLOCK_SIZE = PAGE_SIZE;
const BULK_PAGE_SIZE = 500;
const BULK_SAVE_BATCH_SIZE = 500;
const BULK_CONCURRENCY = 3;
const BULK_FIELDS_WITHOUT_NOV = [
  { field: 'DEC_FORECAST', label: 'December Forecast', type: 'number' },
  { field: 'NOTES', label: 'Notes', type: 'text' },
];
function readNovFormula(template) {
  try {
    return localStorage.getItem(`opex360:nov-formula:${template}`) ?? '';
  } catch {
    return '';
  }
}
function readFormulaPending(template) {
  try {
    return Boolean(readNovFormula(template)) && localStorage.getItem(`opex360:nov-formula-pending:${template}`) !== '0';
  } catch {
    return Boolean(readNovFormula(template));
  }
}
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
  const dashboardRef = useRef(null);
  const activeRequestsRef = useRef(0);
  const pendingQueriesRef = useRef(new Map());
  const nextPastedRowIdRef = useRef(-1);
  const recentEditsRef = useRef(new Map());
  const dirtyRowsRef = useRef(new Map());
  const [isGridLoading, setIsGridLoading] = useState(false);
  const [isMetadataLoading, setIsMetadataLoading] = useState(true);
  const [totalRowCount, setTotalRowCount] = useState(0);
  const [dirtyMap, setDirtyMap] = useState(() => new Map());
  const [rowDialogSeed, setRowDialogSeed] = useState(null);
  const [isAddRowOpen, setIsAddRowOpen] = useState(false);
  const dirtyRows = [...dirtyMap.values()];
  const [metadata, setMetadata] = useState(null);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
  const [isFormulaOpen, setIsFormulaOpen] = useState(false);
  const [savedFormula, setSavedFormula] = useState(() => ({
    template: decodedName,
    value: readNovFormula(decodedName),
    pending: readFormulaPending(decodedName),
  }));
  const formula = savedFormula.template === decodedName ? savedFormula.value : '';
  const formulaPending = savedFormula.template === decodedName && savedFormula.pending;
  const baseColumns = useMemo(() => createForecastColumns(metadata?.columns), [metadata?.columns]);
  const formulaFields = useMemo(
    () => baseColumns.filter((column) => column.type === 'numericColumn').map((column) => column.field),
    [baseColumns],
  );
  const compiledFormula = useMemo(() => {
    if (!formula) return null;
    try {
      return compileForecastFormula(formula, formulaFields);
    } catch {
      return null;
    }
  }, [formula, formulaFields]);
  const columnDefs = useMemo(
    () => createForecastColumns(metadata?.columns, compiledFormula),
    [metadata?.columns, compiledFormula],
  );
  const [visibleColumnIds, setVisibleColumnIds] = useState(() =>
    columnDefs.filter((column) => !column.hide).map((column) => column.colId),
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
    const changed = { ...row };
    if (row.__editedFields?.length) {
      changed.__editedFields = row.__editedFields;
      changed.__editedAt = Date.now();
    } else {
      delete changed.__editedFields;
      delete changed.__editedAt;
    }
    Object.assign(row, changed);
    dirtyRowsRef.current = new Map(dirtyRowsRef.current).set(
      row.UNIQ_ID,
      changed,
    );
    setDirtyMap((current) => new Map(current).set(row.UNIQ_ID, changed));
  }, []);
  const closeTransientUi = useCallback(() => {
    setIsAddRowOpen(false);
    setRowDialogSeed(null);
    setIsBulkUpdateOpen(false);
    setIsFormulaOpen(false);
    setIsCreateViewOpen(false);
    setIsRequiredDimensionsOpen(false);
    setIsViewMenuOpen(false);
    setIsFieldPickerOpen(false);
    dashboardRef.current
      ?.querySelectorAll('details[open]')
      .forEach((details) => {
        details.open = false;
      });
  }, []);
  const trackGridRequest = (delta) => {
    activeRequestsRef.current = Math.max(0, activeRequestsRef.current + delta);
    setIsGridLoading(activeRequestsRef.current > 0);
  };
  const decorateRows = (rows, keyField) =>
    rows.map((row) => {
      const recent = recentEditsRef.current.get(row[keyField]);
      return recent
        ? { ...row, __editedFields: recent.fields, __recentlyUpdated: true }
        : row;
    });
  const prioritizeLatestUpdates = () => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.applyColumnState?.({
      state: [{ colId: 'UPDATED_TS', sort: 'desc', sortIndex: 0 }],
      defaultState: { sort: null },
    });
    api.purgeInfiniteCache?.();
  };
  const datasource = useMemo(
    () => ({
      getRows: async (params) => {
        trackGridRequest(1);
        const request = {
          startRow: params.startRow,
          endRow: params.endRow,
          sortModel: params.sortModel,
          filterModel: params.filterModel,
        };
        const requestKey = JSON.stringify(['detail', decodedName, request]);
        let pending = pendingQueriesRef.current.get(requestKey);
        try {
          if (!pending) {
            pending = forecastService.queryRows(decodedName, request);
            pendingQueriesRef.current.set(requestKey, pending);
          }
          const result = await pending;
          setTotalRowCount(result.totalRowCount);
          const visibleRows = decorateRows(result.rows, 'UNIQ_ID').map(
            (row) => dirtyRowsRef.current.get(row.UNIQ_ID) ?? row,
          );
          params.successCallback(visibleRows, result.totalRowCount);
        } catch (requestError) {
          setMessage(requestError.message);
          params.failCallback();
        } finally {
          if (pendingQueriesRef.current.get(requestKey) === pending) {
            pendingQueriesRef.current.delete(requestKey);
          }
          trackGridRequest(-1);
        }
      },
    }),
    [decodedName],
  );
  const summaryDatasource = useMemo(
    () => ({
      getRows: async (params) => {
        trackGridRequest(1);
        const request = {
          startRow: params.startRow,
          endRow: params.endRow,
          sortModel: params.sortModel,
          filterModel: params.filterModel,
        };
        const requestKey = JSON.stringify(['summary', decodedName, request]);
        let pending = pendingQueriesRef.current.get(requestKey);
        try {
          if (!pending) {
            pending = forecastService.querySummaryRows(decodedName, request);
            pendingQueriesRef.current.set(requestKey, pending);
          }
          const result = await pending;
          setTotalRowCount(result.totalRowCount);
          params.successCallback(result.rows, result.totalRowCount);
        } catch (requestError) {
          setMessage(requestError.message);
          params.failCallback();
        } finally {
          if (pendingQueriesRef.current.get(requestKey) === pending) {
            pendingQueriesRef.current.delete(requestKey);
          }
          trackGridRequest(-1);
        }
      },
    }),
    [decodedName],
  );
  useEffect(() => {
    setSavedFormula({ template: decodedName, value: readNovFormula(decodedName), pending: readFormulaPending(decodedName) });
  }, [decodedName]);
  useEffect(() => {
    if (!compiledFormula) return;
    const api = gridRef.current?.api;
    api?.applyColumnState?.({ state: [{ colId: 'NOV_FORECAST', sort: null, sortIndex: null }] });
    const filters = api?.getFilterModel?.();
    if (filters && 'NOV_FORECAST' in filters) {
      const remaining = { ...filters };
      delete remaining.NOV_FORECAST;
      api.setFilterModel(remaining);
    }
  }, [compiledFormula]);
  useEffect(() => {
    const controller = new AbortController();
    forecastService
      .getMetadata(decodedName, controller.signal)
      .then(setMetadata)
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsMetadataLoading(false);
      });
    return () => controller.abort();
  }, [decodedName]);
  useEffect(() => {
    const currentState = gridRef.current?.api.getColumnState?.();
    const state =
      currentState?.length > 0
        ? currentState
        : columnDefs.map(({ colId, hide }) => ({ colId, hide: Boolean(hide) }));
    setVisibleColumnIds(
      state.filter((column) => !column.hide).map((column) => column.colId),
    );
  }, [columnDefs]);
  useEffect(() => {
    if (isMetadataLoading) return;
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
  }, [columnDefs, decodedName, isMetadataLoading]);
  const handleCellValueChanged = useCallback(
    ({ data, colDef }) => {
      closeTransientUi();
      const editedFields = new Set(data.__editedFields ?? []);
      if (colDef?.field) editedFields.add(colDef.field);
      data.__editedFields = [...editedFields];
      data.__editedAt = Date.now();
      markDirty(data);
      gridRef.current?.api.refreshCells?.({ force: true });
    },
    [closeTransientUi, markDirty],
  );
  const handleGridReady = useCallback(
    ({ api }) => {
      gridRef.current = { api };
      const saved = loadColumnState(decodedName);
      if (saved) {
        const state = limitPinnedDescriptorColumns(
          orderDescriptorColumnsFirst(saved, columnDefs),
        ).map((column) => ({
          ...column,
          ...(column.colId === 'BRAND' ? { hide: false } : {}),
          ...(column.colId === 'NOV_FORECAST' && compiledFormula ? { sort: null, sortIndex: null } : {}),
        }));
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
    [columnDefs, compiledFormula, decodedName],
  );
  const applyNovFormula = (nextFormula) => {
    try {
      if (nextFormula) localStorage.setItem(`opex360:nov-formula:${decodedName}`, nextFormula);
      else localStorage.removeItem(`opex360:nov-formula:${decodedName}`);
      if (nextFormula) localStorage.setItem(`opex360:nov-formula-pending:${decodedName}`, '1');
      else localStorage.removeItem(`opex360:nov-formula-pending:${decodedName}`);
    } catch (error) {
      setMessage(`Unable to save the NOV formula in this browser: ${error.message}`);
      return;
    }
    if (nextFormula) {
      const api = gridRef.current?.api;
      api?.applyColumnState?.({ state: [{ colId: 'NOV_FORECAST', sort: null, sortIndex: null }] });
      const filters = api?.getFilterModel?.();
      if (filters && 'NOV_FORECAST' in filters) {
        const remaining = { ...filters };
        delete remaining.NOV_FORECAST;
        api.setFilterModel(remaining);
      }
    }
    setSavedFormula({ template: decodedName, value: nextFormula, pending: Boolean(nextFormula) });
    setIsFormulaOpen(false);
  };
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
    closeTransientUi();
    setMessage(notice);
    prioritizeLatestUpdates();
  };
  const applyBulkUpdate = useCallback(
    async (field, value) => {
      if (isSaving || !totalRowCount) return;
      setIsSaving(true);
      closeTransientUi();
      setMessage(`Preparing bulk update for all ${totalRowCount.toLocaleString()} records…`);

      try {
        const requests = [];
        for (let startRow = 0; startRow < totalRowCount; startRow += BULK_PAGE_SIZE) {
          requests.push({
            startRow,
            endRow: Math.min(startRow + BULK_PAGE_SIZE, totalRowCount),
            sortModel: [],
            filterModel: {},
          });
        }

        const rows = [];
        for (let start = 0; start < requests.length; start += BULK_CONCURRENCY) {
          const pageResults = await Promise.all(
            requests
              .slice(start, start + BULK_CONCURRENCY)
              .map((request) => forecastService.queryRows(decodedName, request)),
          );
          pageResults.forEach((result) => rows.push(...result.rows));
          setMessage(
            `Loaded ${Math.min(rows.length, totalRowCount).toLocaleString()} of ${totalRowCount.toLocaleString()} records…`,
          );
        }

        const uniqueRows = [...new Map(rows.map((row) => [row.UNIQ_ID, row])).values()];
        const payload = uniqueRows.map((row) => ({ ...row, [field]: value }));
        let processed = 0;

        for (let start = 0; start < payload.length; start += BULK_SAVE_BATCH_SIZE * BULK_CONCURRENCY) {
          const window = payload.slice(
            start,
            start + BULK_SAVE_BATCH_SIZE * BULK_CONCURRENCY,
          );
          const batches = [];
          for (let offset = 0; offset < window.length; offset += BULK_SAVE_BATCH_SIZE) {
            batches.push(window.slice(offset, offset + BULK_SAVE_BATCH_SIZE));
          }
          await Promise.all(
            batches.map((batch) => forecastService.saveRows(decodedName, batch)),
          );
          processed += window.length;
          setMessage(
            `Updated ${Math.min(processed, payload.length).toLocaleString()} of ${payload.length.toLocaleString()} records…`,
          );
        }

        dirtyRowsRef.current = new Map();
        setDirtyMap(new Map());
        gridRef.current?.api.deselectAll?.();
        setSelectedCount(0);
        prioritizeLatestUpdates();
        setMessage(
          `Bulk update completed. ${payload.length.toLocaleString()} records were updated in asynchronous batches.`,
        );
      } catch (error) {
        setMessage(`Bulk update stopped: ${error.message}`);
      } finally {
        setIsSaving(false);
      }
    },
    [closeTransientUi, decodedName, isSaving, totalRowCount],
  );
  const save = async () => {
    gridRef.current?.api.stopEditing?.();
    const rowsToSave = [...dirtyRowsRef.current.values()];
    if (!rowsToSave.length || isSaving) return;
    if (formula && !compiledFormula) {
      setMessage('The NOV formula is invalid or references unavailable fields. Edit or remove it before saving.');
      return;
    }
    if (
      rowsToSave.some(
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
    setIsSaving(true);
    try {
      let savePayload;
      if (formulaPending && compiledFormula) {
        savePayload = await buildNovFormulaPayload({
          templateName: decodedName,
          calculate: compiledFormula,
          dirtyRows: rowsToSave,
          queryRows: forecastService.queryRows,
          onProgress: (loaded, total) => setMessage(`Calculating NOV for ${loaded.toLocaleString()} of ${total.toLocaleString()} records…`),
        });
      } else if (compiledFormula) {
        savePayload = calculateDirtyNovRows(rowsToSave, compiledFormula);
      } else {
        savePayload = rowsToSave.map(({ __editedFields, __editedAt, __recentlyUpdated, ...row }) => row);
      }
      const result = savePayload.length
        ? await forecastService.saveRows(decodedName, savePayload)
        : { message: 'No forecast rows to update.' };
      if (result.errors?.length) throw new Error(result.errors.map((error) => error.message).join('; '));
      if (typeof result.saved === 'number' && result.saved !== savePayload.length) {
        throw new Error(`The server saved ${result.saved} of ${savePayload.length} requested rows. Some changes may already be committed; review the template before retrying.`);
      }
      rowsToSave.forEach((row) => {
        recentEditsRef.current.set(row.UNIQ_ID, {
          fields: [...new Set([...(row.__editedFields ?? []), ...(compiledFormula ? ['NOV_FORECAST'] : [])])],
          updatedAt: Date.now(),
        });
      });
      let saveMessage = result.message;
      if (formulaPending) {
        try {
          localStorage.setItem(`opex360:nov-formula-pending:${decodedName}`, '0');
        } catch {
          saveMessage += ' The browser could not remember that the formula was saved.';
        }
        setSavedFormula((current) => current.template === decodedName ? { ...current, pending: false } : current);
      }
      setMessage(saveMessage);
      dirtyRowsRef.current = new Map();
      setDirtyMap(new Map());
      closeTransientUi();
      gridRef.current?.api.deselectAll?.();
      setSelectedCount(0);
      prioritizeLatestUpdates();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setIsSaving(false);
    }
  };
  const handlePaste = async (event) => {
    if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
    const api = gridRef.current?.api;
    if (!api) return;
    event.preventDefault();
    const matrix = parseClipboardText(event.clipboardData.getData('text'));
    if (
      activeLayoutView !== 'summary' &&
      isFullRowPaste(api, matrix)
    ) {
      const newRows = createRowsFromFullRowPaste(api, matrix, {
        templateName: decodedName,
        version: metadata?.version ?? '10+2',
        createId: () => nextPastedRowIdRef.current--,
      });
      if (!newRows.length) {
        setMessage('Nothing pasted. Copy one or more complete forecast rows.');
        return;
      }
      closeTransientUi();
      setIsSaving(true);
      trackGridRequest(1);
      try {
        const payload = newRows.map(
          ({ __editedFields, __editedAt, ...row }) => row,
        );
        const result = await forecastService.saveRows(decodedName, payload);
        newRows.forEach((row) => {
          recentEditsRef.current.set(row.UNIQ_ID, {
            fields: row.__editedFields,
            updatedAt: Date.now(),
          });
        });
        setMessage(`Inserted ${newRows.length} pasted row(s). ${result.message}`);
        prioritizeLatestUpdates();
      } catch (error) {
        setMessage(error.message);
      } finally {
        setIsSaving(false);
        trackGridRequest(-1);
      }
      return;
    }
    const changed = applyPasteToGrid(api, matrix, {
      allowFullRowPaste: activeLayoutView !== 'summary',
    });
    const emptyPasteMessage =
      activeLayoutView === 'summary'
        ? 'Nothing pasted. Switch to a detail view to paste forecast rows.'
        : 'Nothing pasted. Paste a full row or focus an editable cell (Nov/Dec/Notes).';
    setMessage(
      changed.length
        ? `Pasted into ${changed.length} row(s). Save to persist the changes.`
        : emptyPasteMessage,
    );
      if (changed.length) closeTransientUi();
  };
  const resetLayout = () => {
    localStorage.removeItem(`opex360:grid:${decodedName}`);
    gridRef.current?.api.resetColumnState();
    setActiveLayoutView('full');
  };
  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await forecastService.exportRows(decodedName);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsExporting(false);
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
  let formulaStatus = 'Calculated values were saved. Reapply and save the formula to update newly added rows.';
  if (dirtyRows.length) formulaStatus = 'Save pending row edits to update their calculated NOV values.';
  if (formulaPending) formulaStatus = 'Formula changes alone do not enable Save. Saving an edited row will also update NOV for every row in this template, including filtered and unloaded rows.';
  return (
    <div
      className="forecast-dashboard forecast-detail-dashboard"
      ref={dashboardRef}
    >
      {(isGridLoading || isMetadataLoading || isSaving || isExporting) && (
        <output className="api-loading-overlay" aria-live="polite">
          <span className="api-loading-card">
            <span className="loading-spinner" aria-hidden="true" />
            {isSaving
              ? 'Saving forecast…'
              : isExporting
                ? 'Preparing forecast download…'
                : 'Loading forecast data…'}
          </span>
        </output>
      )}
      {isBulkUpdateOpen && (
        <BulkUpdatePanel
          selectedCount={totalRowCount}
          onApply={applyBulkUpdate}
          onClose={() => setIsBulkUpdateOpen(false)}
          {...(compiledFormula ? { fields: BULK_FIELDS_WITHOUT_NOV } : {})}
        />
      )}
      {isFormulaOpen && (
        <NovFormulaDialog formula={formula} fields={formulaFields} onApply={applyNovFormula} onClose={() => setIsFormulaOpen(false)} />
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
            aria-label="Download forecast"
            className="icon-action"
            disabled={isExporting}
            onClick={handleExport}
            title={isExporting ? 'Preparing forecast download' : 'Download forecast'}
            type="button"
          >
            {isExporting ? '…' : '↓'}
          </button>
          <button
            className="primary"
            disabled={!dirtyRows.length || isSaving || Boolean(formula && !compiledFormula)}
            onClick={save}
            type="button"
          >
            {isSaving
              ? 'Saving…'
              : `Save${dirtyRows.length ? ` (${dirtyRows.length})` : ''}`}
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
                      {columnDefs.filter((column) => !column.hide).map((column) => (
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
                    onClick={() => setIsFormulaOpen(true)}
                    type="button"
                  >
                    {formula ? 'Edit NOV formula' : 'Set NOV formula'}
                  </button>
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
                        disabled={!totalRowCount || isSaving || dirtyRows.length > 0}
                        title={dirtyRows.length > 0 ? 'Save pending changes before a bulk update' : undefined}
                        onClick={() => setIsBulkUpdateOpen(true)}
                        type="button"
                      >
                        Bulk update all ({totalRowCount.toLocaleString()})
                      </button>
                    </>
                  )}
                  <button onClick={resetLayout} type="button">
                    Reset layout
                  </button>
                  <button disabled={isExporting} onClick={handleExport} type="button">
                    {isExporting ? 'Exporting…' : 'Export forecast'}
                  </button>
                </div>
              </details>
            </div>
          </div>
          {activeLayoutView !== 'summary' && formula && (
            <output className="nov-formula-notice">
              {compiledFormula
                ? `NOV formula: ${formula}. ${formulaStatus} Sorting and filtering NOV are unavailable. The formula itself is stored only in this browser.`
                : 'The saved NOV formula is invalid or references unavailable fields. Edit or remove it to restore the calculated preview.'}
            </output>
          )}
          <div className="ag-theme-quartz grid" onPaste={handlePaste}>
            <ForecastGrid
              key={activeLayoutView === 'summary' ? 'summary' : 'detail'}
              dimensionScroll={activeLayoutView !== 'summary'}
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
              paginationPageSizeSelector={[100, 200, 500, 1000]}
              getRowId={({ data }) =>
                String(
                  data.UNIQ_ID ??
                    `${data.FSI_ACCOUNT ?? ''}:${data.GEOGRAPHY ?? ''}`,
                )
              }
              rowClassRules={{
                'recently-updated-row': ({ data }) =>
                  Boolean(data?.__recentlyUpdated || data?.INSERTED === 'Y'),
              }}
              rowSelection={
                activeLayoutView === 'summary'
                  ? undefined
                  : {
                      mode: 'multiRow',
                      headerCheckbox: false,
                      selectAll: 'currentPage',
                    }
              }
              selectionColumnDef={{ headerComponent: SelectAllRowsHeader, pinned: 'left', lockPinned: true }}
              readOnlyEdit={activeLayoutView === 'summary'}
              stopEditingWhenCellsLoseFocus
              suppressDragLeaveHidesColumns
              alwaysShowHorizontalScroll
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
