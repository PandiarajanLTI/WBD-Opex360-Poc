// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SelectAllRowsHeader from './SelectAllRowsHeader';

afterEach(cleanup);

it('selects and clears only the rows on the current page', () => {
  const rows = Array.from({ length: 4 }, (_, index) => ({
    data: { id: index },
    selected: false,
    isSelected() {
      return this.selected;
    },
    setSelected(value) {
      this.selected = value;
    },
  }));
  const listeners = {};
  const api = {
    addEventListener: vi.fn((event, listener) => {
      listeners[event] = listener;
    }),
    removeEventListener: vi.fn(),
    paginationGetCurrentPage: () => 1,
    paginationGetPageSize: () => 2,
    paginationGetRowCount: () => rows.length,
    getDisplayedRowAtIndex: (index) => rows[index],
  };
  render(<SelectAllRowsHeader api={api} />);

  const checkbox = screen.getByRole('checkbox', {
    name: 'Select all rows on this page',
  });
  fireEvent.click(checkbox);

  expect(rows.map((row) => row.selected)).toEqual([false, false, true, true]);
  act(() => listeners.selectionChanged());
  expect(checkbox.checked).toBe(true);

  fireEvent.click(checkbox);
  expect(rows.map((row) => row.selected)).toEqual([false, false, false, false]);
});

it('marks the header checkbox indeterminate for a partially selected page', () => {
  const rows = [
    { data: { id: 1 }, isSelected: () => true },
    { data: { id: 2 }, isSelected: () => false },
  ];
  const api = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    paginationGetCurrentPage: () => 0,
    paginationGetPageSize: () => 2,
    paginationGetRowCount: () => rows.length,
    getDisplayedRowAtIndex: (index) => rows[index],
  };

  render(<SelectAllRowsHeader api={api} />);

  expect(
    screen.getByRole('checkbox', { name: 'Select all rows on this page' })
      .indeterminate,
  ).toBe(true);
});
