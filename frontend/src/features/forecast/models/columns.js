const LOCKED_LEFT_COLUMNS = new Set([
  'TEMPLATE_NAME',
  'VERSION',
  'COMPANY_CODE',
  'BRAND',
  'GEOGRAPHY',
  'COST_CENTER',
  'PROFIT_CENTER',
  'CURRENCY',
  'REPORTABLE',
  'BUSINESS_UNIT',
  'DER_VENDOR_NAME',
  'DER_PROJECT_NAME',
  'DER_INTERNAL_ORDER_ID',
  'DER_PURCHASE_ORDER',
  'FORECAST_DRIVER_ID',
  'AGG_TYPE',
  'FSI_ACCOUNT',
]);

export const isLockedLeft = (field) => LOCKED_LEFT_COLUMNS.has(field);

export const DESCRIPTOR_COLUMNS = [
  ['TEMPLATE_NAME', 'Template'],
  ['VERSION', 'Version'],
  ['COMPANY_CODE', 'Company Code'],
  ['BRAND', 'Brand'],
  ['GEOGRAPHY', 'Geography'],
  ['COST_CENTER', 'Cost Center'],
  ['PROFIT_CENTER', 'Profit Center'],
  ['CURRENCY', 'Currency'],
  ['REPORTABLE', 'Reportable'],
  ['BUSINESS_UNIT', 'Business Unit'],
  ['DER_VENDOR_NAME', 'DER Vendor Name'],
  ['DER_PROJECT_NAME', 'DER Project Name'],
  ['DER_INTERNAL_ORDER_ID', 'DER Internal Order ID'],
  ['DER_PURCHASE_ORDER', 'DER Purchase Order'],
  ['FORECAST_DRIVER_ID', 'Forecast Driver ID'],
  ['AGG_TYPE', 'AGG Type'],
  ['FSI_ACCOUNT', 'FSI Account'],
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
export function createForecastColumns(apiColumns = []) {
  const descriptor = DESCRIPTOR_COLUMNS.map(([field, headerName]) => ({
    field,
    headerName,
    colId: field,
    pinned: isLockedLeft(field) ? 'left' : null,
    lockPinned: isLockedLeft(field),
    suppressMovable: isLockedLeft(field),
    editable: ({ data }) => data?.INSERTED === 'Y' || field === 'NOTES',
    filter: 'agTextColumnFilter',
    minWidth: field === 'NOTES' ? 220 : 130,
    cellClassRules: {
      'recently-edited-cell': ({ data }) =>
        data?.__editedFields?.includes(field) ?? false,
    },
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
      'recently-edited-cell': ({ data }) =>
        data?.__editedFields?.includes(`${month}_FORECAST`) ?? false,
    },
    minWidth: 110,
    context: { columnType: 'month', monthOrder: MONTH_COLUMNS.indexOf(month) },
  }));
  const columns = [
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
    {
      field: 'UPDATED_TS',
      colId: 'UPDATED_TS',
      hide: false,
      sortable: true,
    },
  ];
  const knownFields = new Set(columns.map(({ colId }) => colId));
  const additionalColumns = [...new Set(apiColumns)]
    .filter((field) => typeof field === 'string' && !knownFields.has(field))
    .map((field) => {
      const isNumeric =
        /_(ACTUALS|FORECAST|BUDGET|PRATE|AMOUNT|VARIANCE|WORKING_FORECAST|PRIORFORECAST|PRIORACTUALS)$/.test(
          field,
        ) || field === 'FX_RATE';
      return {
        field,
        colId: field,
        headerName: field.replaceAll('_', ' '), 
        // Keep metadata descriptors in the horizontally scrollable viewport.
        pinned: null,
        lockPinned: isLockedLeft(field),
        suppressMovable: isLockedLeft(field),
        editable: ({ data }) => data?.INSERTED === 'Y',
        filter: isNumeric ? 'agNumberColumnFilter' : 'agTextColumnFilter',
        ...(isNumeric ? { type: 'numericColumn' } : {}),
        minWidth: 140,
        cellClassRules: {
          'recently-edited-cell': ({ data }) =>
            data?.__editedFields?.includes(field) ?? false,
        },
        context: { columnType: isLockedLeft(field) ? 'descriptor' : 'api' },
      };
    });
  return [
    ...descriptor,
    ...additionalColumns.filter((column) => isLockedLeft(column.field)),
    ...columns.slice(descriptor.length),
    ...additionalColumns.filter((column) => !isLockedLeft(column.field)),
  ];
}
