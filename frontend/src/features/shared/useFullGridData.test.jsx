// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFullGridData } from './useFullGridData';

afterEach(cleanup);
const wrapper = ({ children }) => <StrictMode>{children}</StrictMode>;
const response = (id) => ({ rows: [{ id }], totalRowCount: 1 });

it('joins StrictMode effect replays, caches by name, and keeps rowData stable', async () => {
  const fetchRows = vi.fn(async () => response(1));
  const { result, rerender } = renderHook(
    ({ name }) => useFullGridData({ name, fetchRows }),
    { initialProps: { name: 'A' }, wrapper },
  );
  await act(async () => {});
  expect(fetchRows).toHaveBeenCalledOnce();
  const rows = result.current.rowData;
  rerender({ name: 'A' });
  expect(result.current.rowData).toBe(rows);
  rerender({ name: 'B' });
  await act(async () => {});
  expect(fetchRows).toHaveBeenCalledTimes(2);
  rerender({ name: 'A' });
  expect(result.current.rowData).toBe(rows);
  expect(fetchRows).toHaveBeenCalledTimes(2);
});

it('loads lazily and invalidates inactive modes without fetching until selected', async () => {
  const fetchRows = vi.fn(async () => response(1));
  const { result, rerender } = renderHook(
    ({ enabled }) => useFullGridData({ name: 'summary', fetchRows, enabled }),
    { initialProps: { enabled: false }, wrapper },
  );
  expect(fetchRows).not.toHaveBeenCalled();
  rerender({ enabled: true });
  await act(async () => {});
  const rows = result.current.rowData;
  rerender({ enabled: false });
  act(() => result.current.invalidate());
  expect(result.current.rowData).toBe(rows);
  expect(fetchRows).toHaveBeenCalledOnce();
  rerender({ enabled: true });
  await act(async () => {});
  expect(fetchRows).toHaveBeenCalledTimes(2);
});

it('retains cached rows on reload failure and only retries explicitly', async () => {
  const fetchRows = vi.fn().mockResolvedValueOnce(response(1))
    .mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(response(2));
  const { result, rerender } = renderHook(() => useFullGridData({ name: 'A', fetchRows }), { wrapper });
  await act(async () => {});
  const rows = result.current.rowData;
  await act(async () => result.current.reload());
  expect(result.current.error.message).toBe('Offline');
  expect(result.current.rowData).toBe(rows);
  rerender();
  expect(fetchRows).toHaveBeenCalledTimes(2);
  await act(async () => result.current.reload());
  expect(result.current.error).toBeNull();
  expect(result.current.rowData).toEqual([{ id: 2 }]);
});

it('ignores stale requests after mutation reload and isolates page mounts', async () => {
  let resolveOld;
  const fetchRows = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockResolvedValue(response(2));
  const first = renderHook(() => useFullGridData({ name: 'A', fetchRows }), { wrapper });
  await act(async () => {});
  await act(async () => first.result.current.reload());
  await act(async () => resolveOld(response(1)));
  expect(first.result.current.rowData).toEqual([{ id: 2 }]);
  first.unmount();
  const second = renderHook(() => useFullGridData({ name: 'A', fetchRows }), { wrapper });
  await act(async () => {});
  expect(fetchRows).toHaveBeenCalledTimes(3);
  expect(second.result.current.rowData).toEqual([{ id: 2 }]);
});