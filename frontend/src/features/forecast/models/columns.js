export const DESCRIPTOR_COLUMNS = [
  ['TEMPLATE_NAME', 'Template'],
  ['VERSION', 'Version'],
  ['COMPANY_CODE', 'Company Code'],
  ['PROFIT_CENTER', 'Profit Center'],
  ['COST_CENTER', 'Cost Center'],
  ['FSI_ACCOUNT', 'FSI Account'],
  ['GEOGRAPHY', 'Geography'],
  ['BRAND', 'Brand'],
  ['NOTES', 'Notes'],
];
export const MONTH_COLUMNS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];
export function createForecastColumns() {
  const descriptor = DESCRIPTOR_COLUMNS.map(([field, headerName]) => ({
    field,
    headerName,
    colId: field,
    pinned: 'left',
    lockPinned: false,
    suppressMovable: false,
    editable: ({ data }) => data?.INSERTED === 'Y' || field === 'NOTES',
    filter: 'agTextColumnFilter',
    minWidth: field === 'NOTES' ? 220 : 130,
    context: { columnType: 'descriptor' },
  }));
  const months = MONTH_COLUMNS.map((month) => ({
    field: `${month}_FORECAST`,
    headerName: month,
    colId: `${month}_FORECAST`,
    editable: ({ data }) =>
      data?.INSERTED === 'Y' || ['NOV', 'DEC'].includes(month),
    filter: 'agNumberColumnFilter',
    type: 'numericColumn',
    valueParser: ({ newValue }) => (newValue === '' ? null : Number(newValue)),
    cellClassRules: {
      'editable-cell': ({ data }) =>
        data?.INSERTED === 'Y' || ['NOV', 'DEC'].includes(month),
    },
    minWidth: 110,
    context: { columnType: 'month', monthOrder: MONTH_COLUMNS.indexOf(month) },
  }));
  return [
    ...descriptor,
    ...months,
    {
      field: 'FY_WORKING_FORECAST',
      headerName: 'FY Forecast',
      colId: 'FY_WORKING_FORECAST',
      type: 'numericColumn',
      filter: 'agNumberColumnFilter',
      minWidth: 130,
      context: { columnType: 'summary' },
    },
  ];
}
