import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

const EMPTY_ROWS = [];

function createEntry() {
  return {
    snapshot: { rowData: EMPTY_ROWS, totalRowCount: 0, status: 'idle', error: null },
    listeners: new Set(),
    generation: 0,
    pending: null,
  };
}

function publish(entry, changes) {
  entry.snapshot = { ...entry.snapshot, ...changes };
  entry.listeners.forEach((listener) => listener());
}

function invalidateEntry(entry) {
  entry.generation += 1;
  entry.pending = null;
  // Keep the previous rows visible until the replacement request succeeds.
  publish(entry, { status: 'idle', error: null });
}

function load(entry, options) {
  if (entry.pending) return entry.pending;
  const generation = entry.generation;
  publish(entry, { status: 'loading', error: null });
  const pending = Promise.resolve()
    .then(() => options.current.fetchRows())
    .then((result) => {
      if (entry.generation !== generation) return;
      // AG Grid edits row objects; never mutate a shared service response.
      const rows = result.rows.map((row) => ({ ...row }));
      publish(entry, {
        rowData: options.current.decorateRows?.(rows) ?? rows,
        totalRowCount: result.totalRowCount ?? rows.length,
        status: 'ready',
      });
    })
    .catch((error) => {
      if (entry.generation === generation) publish(entry, { status: 'error', error });
    })
    .finally(() => {
      if (entry.pending === pending) entry.pending = null;
    });
  entry.pending = pending;
  return pending;
}

// Each mounted page owns its cache, including separate entries per name/mode.
// Effect cleanup only unsubscribes: StrictMode's effect replay joins the same
// pending request, while a genuine new page mount gets a fresh cache.
export function useFullGridData({ name, fetchRows, decorateRows, enabled = true }) {
  const cache = useRef(new Map());
  if (!cache.current.has(name)) cache.current.set(name, createEntry());
  const entry = cache.current.get(name);
  const optionsByEntry = useRef(new Map());
  if (!optionsByEntry.current.has(entry)) optionsByEntry.current.set(entry, { current: null });
  const options = optionsByEntry.current.get(entry);
  options.current = { fetchRows, decorateRows };
  const subscribe = useCallback((listener) => {
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }, [entry]);
  const getSnapshot = useCallback(() => entry.snapshot, [entry]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (enabled && entry.snapshot.status === 'idle') void load(entry, options);
  }, [enabled, entry, options, snapshot.status]);

  const invalidate = useCallback(() => invalidateEntry(entry), [entry]);
  const reload = useCallback(() => {
    invalidateEntry(entry);
    return load(entry, options);
  }, [entry, options]);

  return {
    ...snapshot,
    isLoading: enabled && (snapshot.status === 'idle' || snapshot.status === 'loading'),
    invalidate,
    reload,
  };
}