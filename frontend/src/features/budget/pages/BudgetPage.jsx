import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { apiJson } from '../../../services/api/apiClient';
import BulkUpdatePanel from '../../forecast/components/BulkUpdatePanel';
import { applyPasteToGrid, parseClipboardText } from '../../shared/clipboard';
import SelectAllRowsHeader from '../../shared/SelectAllRowsHeader';

const EDITABLE = new Set([
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
]);
const FIELDS = [
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
const BULK_FIELDS = FIELDS.filter((f) => EDITABLE.has(f)).map((field) => ({
  field,
  label: field.split('_').join(' '),
  type: 'text',
}));
const STORAGE_KEY = 'opex360:grid:budget';

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export default function BudgetPage() {
  const [dirty, setDirty] = useState({});
  const [selectedCount, setSelectedCount] = useState(0);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGridLoading, setIsGridLoading] = useState(false);
  const [message, setMessage] = useState('');
  const apiRef = useRef(null);
  const activeRequestsRef = useRef(0);
  const dirtyRef = useRef({});
  const recentEditsRef = useRef({});
  const trackGridRequest = (delta) => {
    activeRequestsRef.current = Math.max(0, activeRequestsRef.current + delta);
    setIsGridLoading(activeRequestsRef.current > 0);
  };
  const markDirty = (row, field) => {
    const updated = {
      ...row,
      __editedFields: [
        ...new Set([...(row.__editedFields ?? []), ...(field ? [field] : [])]),
      ],
      __editedAt: Date.now(),
    };
    Object.assign(row, updated);
    dirtyRef.current = { ...dirtyRef.current, [row.COSTCENTER]: updated };
    setDirty((current) => ({ ...current, [row.COSTCENTER]: updated }));
  };
  const datasource = useMemo(
    () => ({
      getRows: async (params) => {
        trackGridRequest(1);
        try {
          const result = await apiJson('/budget/query', {
            method: 'POST',
            body: JSON.stringify({
              startRow: params.startRow,
              endRow: params.endRow,
              sortModel: params.sortModel,
              filterModel: params.filterModel,
            }),
          });
          const visibleRows = result.rows.map((row) => {
            const recent = recentEditsRef.current[row.COSTCENTER];
            const fresh = recent
              ? {
                  ...row,
                  __editedFields: recent.fields,
                  __recentlyUpdated: true,
                }
              : row;
            return dirtyRef.current[row.COSTCENTER] ?? fresh;
          });
          params.successCallback(visibleRows, result.totalRowCount);
        } catch (error) {
          setMessage(error.message);
          params.failCallback();
        } finally {
          trackGridRequest(-1);
        }
      },
    }),
    [],
  );
  const columns = useMemo(
    () =>
      FIELDS.map((field) => ({
        field,
        colId: field,
        editable: EDITABLE.has(field),
        pinned: field === 'COSTCENTER' ? 'left' : null,
        minWidth: 150,
        filter: 'agTextColumnFilter',
        cellClassRules: {
          'recently-edited-cell': ({ data }) =>
            data?.__editedFields?.includes(field) ?? false,
        },
      })),
    [],
  );
  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: true,
      floatingFilter: false,
      suppressHeaderMenuButton: false,
      resizable: true,
      minWidth: 150,
    }),
    [],
  );

  const handleCellValueChanged = useCallback(({ data, colDef }) => {
    setIsBulkOpen(false);
    document
      .querySelectorAll('.budget-page details[open]')
      .forEach((details) => {
        details.open = false;
      });
    markDirty(data, colDef?.field);
    apiRef.current?.refreshCells?.({ force: true });
  }, []);

  const handleGridReady = useCallback(({ api }) => {
    apiRef.current = api;
    const saved = loadState();
    if (saved) api.applyColumnState({ state: saved, applyOrder: true });
  }, []);

  const persistColumns = useCallback(({ api, finished }) => {
    if (finished === false) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        api.getColumnState().map(({ colId, pinned, width, hide }) => ({
          colId,
          pinned,
          width,
          hide,
        })),
      ),
    );
  }, []);

  const applyBulk = (field, value) => {
    const api = apiRef.current;
    const selected = api?.getSelectedNodes() ?? [];
    selected.forEach((node) => {
      node.setDataValue(field, value);
      markDirty({ ...node.data, [field]: value }, field);
    });
    setIsBulkOpen(false);
    setMessage(
      `Applied ${field} to ${selected.length} row(s). Save to persist the changes.`,
    );
  };

  const handlePaste = (event) => {
    if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
    const api = apiRef.current;
    if (!api) return;
    event.preventDefault();
    const changed = applyPasteToGrid(
      api,
      parseClipboardText(event.clipboardData.getData('text')),
      { editableOnly: true },
    );
    setMessage(`Pasted into ${changed.length} row(s). Save to persist.`);
  };

  const save = async () => {
    const changed = Object.values(dirty);
    if (!changed.length || isSaving) return;
    setIsSaving(true);
    try {
      const payload = changed.map(
        ({ __editedFields, __editedAt, __recentlyUpdated, ...row }) => row,
      );
      const result = await apiJson('/budget/bulk-update', {
        method: 'PATCH',
        body: JSON.stringify({ rows: payload }),
      });
      changed.forEach((row) => {
        recentEditsRef.current[row.COSTCENTER] = {
          fields: row.__editedFields ?? [],
          updatedAt: Date.now(),
        };
      });
      dirtyRef.current = {};
      setDirty({});
      setIsBulkOpen(false);
      apiRef.current?.deselectAll?.();
      setSelectedCount(0);
      setMessage(result.message);
      apiRef.current?.applyColumnState?.({
        state: [{ colId: 'UPDATED_ON', sort: 'desc', sortIndex: 0 }],
        defaultState: { sort: null },
      });
      apiRef.current?.purgeInfiniteCache?.();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const dirtyCount = Object.keys(dirty).length;
  return (
    <div className="budget-page">
      {(isGridLoading || isSaving) && (
        <output className="api-loading-overlay" aria-live="polite">
          <span className="api-loading-card">
            <span className="loading-spinner" aria-hidden="true" />
            {isSaving ? 'Saving budget updates…' : 'Loading budget data…'}
          </span>
        </output>
      )}
      {isBulkOpen && (
        <BulkUpdatePanel
          selectedCount={selectedCount}
          fields={BULK_FIELDS}
          onApply={applyBulk}
          onClose={() => setIsBulkOpen(false)}
        />
      )}
      <div className="page-heading">
        <div>
          <h1>Budget Holder</h1>
          <p>
            Review all budget table fields and update editable attributes inline
            or in bulk.
          </p>
        </div>
        <div className="actions">
          <button disabled={!selectedCount} onClick={() => setIsBulkOpen(true)}>
            Bulk update ({selectedCount})
          </button>
          <button
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              apiRef.current?.resetColumnState();
            }}
          >
            Reset layout
          </button>
          <button
            className="primary"
            disabled={!dirtyCount || isSaving}
            onClick={save}
          >
            {isSaving ? 'Saving…' : `Save ${dirtyCount || ''}`}
          </button>
        </div>
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="panel grid-panel">
        <div className="ag-theme-quartz grid" onPaste={handlePaste}>
          <AgGridReact
            theme="legacy"
            columnDefs={columns}
            defaultColDef={defaultColDef}
            datasource={datasource}
            rowModelType="infinite"
            cacheBlockSize={100}
            maxBlocksInCache={5}
            pagination
            paginationPageSize={100}
            paginationPageSizeSelector={[100, 200, 500, 1000]}
            rowSelection={{
              mode: 'multiRow',
              headerCheckbox: false,
              selectAll: 'currentPage',
            }}
            selectionColumnDef={{ headerComponent: SelectAllRowsHeader }}
            stopEditingWhenCellsLoseFocus
            suppressDragLeaveHidesColumns
            getRowId={({ data }) => data.COSTCENTER}
            rowClassRules={{
              'recently-updated-row': ({ data }) =>
                Boolean(data?.__recentlyUpdated),
            }}
            onGridReady={handleGridReady}
            onCellValueChanged={handleCellValueChanged}
            onSelectionChanged={({ api }) =>
              setSelectedCount(api.getSelectedRows().length)
            }
            onColumnMoved={persistColumns}
            onColumnResized={persistColumns}
            onColumnPinned={persistColumns}
          />
        </div>
      </div>
    </div>
  );
}
