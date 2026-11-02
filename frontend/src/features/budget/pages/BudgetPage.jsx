import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { apiJson } from '../../../services/api/apiClient';
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
export default function BudgetPage() {
  const [rows, setRows] = useState([]);
  const columns = useMemo(
    () =>
      [
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
      ].map((field) => ({
        field,
        editable: EDITABLE.has(field),
        pinned: EDITABLE.has(field) ? null : 'left',
        minWidth: 150,
      })),
    [],
  );
  useEffect(() => {
    apiJson('/budget/query', {
      method: 'POST',
      body: JSON.stringify({
        startRow: 0,
        endRow: 100,
        sortModel: [],
        filterModel: {},
      }),
    }).then((result) => setRows(result.rows));
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Budget maintenance</h1>
          <p>Schema-led editable cost-center attributes.</p>
        </div>
      </div>
      <div className="panel grid-panel">
        <div className="ag-theme-quartz grid">
          <AgGridReact
            rowData={rows}
            columnDefs={columns}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
            getRowId={({ data }) => data.COSTCENTER}
          />
        </div>
      </div>
    </>
  );
}
