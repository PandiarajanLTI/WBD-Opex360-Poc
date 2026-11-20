import { describe, expect, it } from 'vitest';
import { mapInlinePaste, mapInlinePasteRows } from './inlinePaste';

const columns = [
  { field: 'TEMPLATE_NAME', headerName: 'Template' },
  { field: 'VERSION', headerName: 'Version' },
  { field: 'COMPANY_CODE', headerName: 'Company Code', editable: true },
  { field: 'BRAND', headerName: 'Brand', editable: true },
  { field: 'GEOGRAPHY', headerName: 'Geography', editable: true },
  {
    field: 'JAN_FORECAST',
    headerName: 'JAN',
    editable: true,
    type: 'numericColumn',
    valueParser: ({ newValue }) =>
      newValue === '' ? null : Number(newValue),
  },
  { field: 'FY_WORKING_FORECAST', headerName: 'FY Forecast' },
];

const values = { INSERTED: 'Y' };

function map(text, field = 'COMPANY_CODE') {
  return mapInlinePaste({ text, field, columnDefs: columns, values });
}

describe('mapInlinePaste', () => {
  it('maps a complete unheaded Excel row to all editable new-row fields', () => {
    expect(map('US02\tStudio B\tEMEA', 'BRAND')).toEqual({
      COMPANY_CODE: 'US02',
      BRAND: 'Studio B',
      GEOGRAPHY: 'EMEA',
    });
  });

  it('maps a full displayed row while ignoring immutable fields', () => {
    expect(map('Template A\t10+2\tUS02\tStudio B\tEMEA\t45\t999')).toEqual({
      COMPANY_CODE: 'US02',
      BRAND: 'Studio B',
      GEOGRAPHY: 'EMEA',
    });
  });

  it('maps headered paste by column names', () => {
    expect(
      map('Brand\tJAN\tCompany Code\nStudio C\t55\tUS03', 'GEOGRAPHY'),
    ).toEqual({
      BRAND: 'Studio C',
      COMPANY_CODE: 'US03',
    });
  });

  it('maps multiple spreadsheet rows from the focused editable column', () => {
    expect(
      mapInlinePasteRows({
        text: 'US02\tStudio B\r\nUS03\tStudio C',
        field: 'COMPANY_CODE',
        columnDefs: columns,
        values,
      }),
    ).toEqual([
      { COMPANY_CODE: 'US02', BRAND: 'Studio B' },
      { COMPANY_CODE: 'US03', BRAND: 'Studio C' },
    ]);
  });
});
