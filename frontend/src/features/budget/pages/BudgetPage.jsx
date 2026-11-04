import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { apiJson } from '../../../services/api/apiClient';
import BulkUpdatePanel from '../../forecast/components/BulkUpdatePanel';
import { applyPasteToGrid, parseClipboardText } from '../../shared/clipboard';

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
  'COMPANY_CODE',
  'PROFIT_CENTER',
  'FUNCTION',
  'SUBFUNCTION',
  'BUDGET_HOLDER',
  'REGION',
  'LOCATION',
  'CITY',
];
const BULK_FIELDS = FIELDS.filter((f) => EDITABLE.has(f)).map((field) => ({
  field,
  label: field.replace('_', ' '),
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
  const [message, setMessage] = useState('');
  const apiRef = useRef(null);
  const dirtyRef = useRef({});
  const datasource = useMemo(
    () => ({
      getRows: async (params) => {
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
          const visibleRows = result.rows.map(
            (row) => dirtyRef.current[row.COSTCENTER] ?? row,
          );
          params.successCallback(visibleRows, result.totalRowCount);
        } catch (error) {
          setMessage(error.message);
          params.failCallback();
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
        pinned: EDITABLE.has(field) ? null : 'left',
        minWidth: 150,
        filter: 'agTextColumnFilter',
      })),
    [],
  );
  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: true,
      floatingFilter: true,
      resizable: true,
      minWidth: 150,
    }),
    [],
  );

  const handleCellValueChanged = useCallback(({ data }) => {
    dirtyRef.current = { ...dirtyRef.current, [data.COSTCENTER]: data };
    setDirty((current) => ({ ...current, [data.COSTCENTER]: data }));
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
    selected.forEach((node) => node.setDataValue(field, value));
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
    );
    setMessage(`Pasted into ${changed.length} row(s). Save to persist.`);
  };

  const save = async () => {
    const changed = Object.values(dirty);
    if (!changed.length) return;
    try {
      const result = await apiJson('/budget/bulk-update', {
        method: 'PATCH',
        body: JSON.stringify({ rows: changed }),
      });
      dirtyRef.current = {};
      setDirty({});
      setMessage(result.message);
      apiRef.current?.refreshInfiniteCache();
    } catch (e) {
      setMessage(e.message);
    }
  };

  const dirtyCount = Object.keys(dirty).length;
  return (
    <>
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
          <h1>Budget holder mapping</h1>
          <p>
            Schema-led editable cost-center attributes. Filter by column or edit
            cells inline.
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
          <button className="primary" disabled={!dirtyCount} onClick={save}>
            Save {dirtyCount || ''}
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
            cacheBlockSize={200}
            maxBlocksInCache={5}
            pagination
            paginationPageSize={100}
            paginationPageSizeSelector={[50, 100, 200]}
            rowSelection={{ mode: 'multiRow', headerCheckbox: false }}
            stopEditingWhenCellsLoseFocus
            suppressDragLeaveHidesColumns
            getRowId={({ data }) => data.COSTCENTER}
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
    </>
  );
}
