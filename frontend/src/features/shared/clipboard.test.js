import { expect, it } from 'vitest';
import {
  applyPasteToGrid,
  createRowsFromFullRowPaste,
  isFullRowPaste,
  parseClipboardText,
} from './clipboard';

it('parses Excel tab/newline text', () => {
  expect(parseClipboardText('1\t2\r\n3\t4\r\n')).toEqual([
    ['1', '2'],
    ['3', '4'],
  ]);
});

it('pastes into editable cells only', () => {
  const data = [
    { A: 0, B: 0, C: 0 },
    { A: 0, B: 0, C: 0 },
  ];
  const col = (id, editable) => ({
    getColId: () => id,
    isCellEditable: () => editable,
    getColDef: () => ({
      field: id,
      valueParser: ({ newValue }) => Number(newValue),
    }),
  });
  const columns = [col('A', true), col('B', false), col('C', false)];
  const nodes = data.map((d, i) => ({
    id: String(i),
    data: d,
    setDataValue: (k, v) => {
      d[k] = v;
    },
  }));
  const api = {
    getFocusedCell: () => ({ rowIndex: 0, column: columns[0] }),
    getAllDisplayedColumns: () => columns,
    getDisplayedRowAtIndex: (i) => nodes[i],
  };
  const changed = applyPasteToGrid(api, [
    ['5', '6'],
    ['7', '8'],
  ]);
  expect(data).toEqual([
    { A: 5, B: 0, C: 0 },
    { A: 7, B: 0, C: 0 },
  ]);
  expect(changed).toHaveLength(2);
});

it('pastes a full row across data columns while preserving row keys and totals', () => {
  const data = {
    UNIQ_ID: 1,
    TEMPLATE_NAME: 'Warner Media',
    COMPANY_CODE: 'US01',
    NOV_FORECAST: 100,
    FY_WORKING_FORECAST: 100,
  };
  const columns = [
    'TEMPLATE_NAME',
    'COMPANY_CODE',
    'NOV_FORECAST',
    'FY_WORKING_FORECAST',
  ].map((field) => ({
    getColId: () => field,
    getColDef: () => ({
      field,
      valueParser:
        field === 'NOV_FORECAST'
          ? ({ newValue }) => (newValue === '' ? null : Number(newValue))
          : undefined,
    }),
    isCellEditable: () => false,
  }));
  const node = {
    id: '1',
    data,
    setDataValue: (field, value) => {
      data[field] = value;
    },
  };
  const api = {
    getFocusedCell: () => ({ rowIndex: 0, column: columns[2] }),
    getAllDisplayedColumns: () => columns,
    getDisplayedRowAtIndex: () => node,
  };

  const changed = applyPasteToGrid(api, [
    ['Another template', 'CA01', '250', '250'],
  ]);

  expect(data).toEqual({
    UNIQ_ID: 1,
    TEMPLATE_NAME: 'Warner Media',
    COMPANY_CODE: 'CA01',
    NOV_FORECAST: 250,
    FY_WORKING_FORECAST: 100,
  });
  expect(changed).toEqual([data]);
});

it('keeps read-only cells unchanged during editable-only full-row paste', () => {
  const data = { COSTCENTER: 'C001', FUNCTION: 'Finance', UPDATED_BY: 'admin' };
  const columns = ['COSTCENTER', 'FUNCTION', 'UPDATED_BY'].map((field) => ({
    getColId: () => field,
    getColDef: () => ({ field }),
    isCellEditable: () => field === 'FUNCTION',
  }));
  const node = {
    id: 'C001',
    data,
    setDataValue: (field, value) => {
      data[field] = value;
    },
  };
  const api = {
    getFocusedCell: () => ({ rowIndex: 0, column: columns[1] }),
    getAllDisplayedColumns: () => columns,
    getDisplayedRowAtIndex: () => node,
  };

  expect(
    applyPasteToGrid(api, [['C999', 'Operations', 'other']], {
      editableOnly: true,
    }),
  ).toEqual([data]);
  expect(data).toEqual({
    COSTCENTER: 'C001',
    FUNCTION: 'Operations',
    UPDATED_BY: 'admin',
  });
});

it('keeps summary rows read-only during full-width paste', () => {
  const data = { FSI_ACCOUNT: 'A001', GEOGRAPHY: 'NA', ROW_COUNT: 3 };
  const columns = ['FSI_ACCOUNT', 'GEOGRAPHY', 'ROW_COUNT'].map((field) => ({
    getColId: () => field,
    getColDef: () => ({ field }),
    isCellEditable: () => false,
  }));
  const node = {
    id: 'summary',
    data,
    setDataValue: (field, value) => {
      data[field] = value;
    },
  };
  const api = {
    getFocusedCell: () => ({ rowIndex: 0, column: columns[0] }),
    getAllDisplayedColumns: () => columns,
    getDisplayedRowAtIndex: () => node,
  };

  expect(
    applyPasteToGrid(api, [['A002', 'EMEA', '4']], {
      allowFullRowPaste: false,
    }),
  ).toEqual([]);
  expect(data).toEqual({ FSI_ACCOUNT: 'A001', GEOGRAPHY: 'NA', ROW_COUNT: 3 });
});

it('treats a full forecast row paste as a new inserted record', () => {
  const columns = ['UNIQ_ID', 'TEMPLATE_NAME', 'COMPANY_CODE', 'NOV_FORECAST'].map(
    (field) => ({
      getColId: () => field,
      getColDef: () => ({
        field,
        valueParser:
          field === 'NOV_FORECAST'
            ? ({ newValue }) => Number(newValue)
            : undefined,
      }),
    }),
  );
  const api = { getAllDisplayedColumns: () => columns };
  const matrix = [['12', 'Other template', 'US02', '450']];

  expect(isFullRowPaste(api, matrix)).toBe(true);
  expect(
    createRowsFromFullRowPaste(api, matrix, {
      templateName: 'Warner Media',
      version: '10+2',
      createId: () => -1,
    }),
  ).toEqual([
    expect.objectContaining({
      UNIQ_ID: -1,
      TEMPLATE_NAME: 'Warner Media',
      VERSION: '10+2',
      INSERTED: 'Y',
      COMPANY_CODE: 'US02',
      NOV_FORECAST: 450,
      __editedFields: ['COMPANY_CODE', 'NOV_FORECAST'],
    }),
  ]);
});
