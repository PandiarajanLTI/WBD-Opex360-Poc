// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BudgetPage from './BudgetPage';

const { grid } = vi.hoisted(() => ({ grid: vi.fn(() => null) }));

vi.mock('ag-grid-react', () => ({ AgGridReact: grid }));
vi.mock('../../../services/api/apiClient', () => ({
  apiJson: () => Promise.resolve({ rows: [] }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('prevents dragging columns outside the budget grid from hiding them', async () => {
  await act(async () => {
    render(<BudgetPage />);
  });

  const props = grid.mock.lastCall[0];
  expect(props.suppressDragLeaveHidesColumns).toBe(true);
  expect(props.defaultColDef.suppressMovable).not.toBe(true);
  expect(
    props.columnDefs.every((column) => column.suppressMovable !== true),
  ).toBe(true);
});
