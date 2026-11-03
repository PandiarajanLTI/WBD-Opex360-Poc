import { expect, it } from 'vitest';
import { applyPasteToGrid, parseClipboardText } from './clipboard';

it('parses Excel tab/newline text', () => {
  expect(parseClipboardText('1\t2\r\n3\t4\r\n')).toEqual([
    ['1', '2'],
    ['3', '4'],
  ]);
});

it('pastes into editable cells only', () => {
  const data = [
    { A: 0, B: 0 },
    { A: 0, B: 0 },
  ];
  const col = (id, editable) => ({
    getColId: () => id,
    isCellEditable: () => editable,
    getColDef: () => ({
      field: id,
      valueParser: ({ newValue }) => Number(newValue),
    }),
  });
  const columns = [col('A', true), col('B', false)];
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
    { A: 5, B: 0 },
    { A: 7, B: 0 },
  ]);
  expect(changed).toHaveLength(2);
});
