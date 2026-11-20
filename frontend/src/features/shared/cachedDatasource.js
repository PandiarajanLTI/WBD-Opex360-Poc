const stableKey = (value) => JSON.stringify(value ?? null);

export function createCachedDatasource({
  query,
  mapRows = (rows) => rows,
  getDirtyRow,
  maxEntries = 100,
}) {
  const resolved = new Map();
  const pending = new Map();
  let generation = 0;

  const requestKey = (request) => stableKey({
    startRow: request.startRow,
    endRow: request.endRow,
    sortModel: request.sortModel ?? [],
    filterModel: request.filterModel ?? {},
  });

  const touch = (key, value) => {
    resolved.delete(key);
    resolved.set(key, value);
    while (resolved.size > maxEntries) {
      resolved.delete(resolved.keys().next().value);
    }
  };

  const withDirtyRows = (rows) => rows.map((row) => getDirtyRow?.(row) ?? row);

  return {
    async get(request) {
      const key = requestKey(request);
      const cached = resolved.get(key);
      if (cached) {
        touch(key, cached);
        return { ...cached, rows: withDirtyRows(cached.rows) };
      }

      if (pending.has(key)) return pending.get(key);
      const requestGeneration = generation;
      const promise = Promise.resolve(query(request))
        .then((response) => {
          const normalized = {
            ...response,
            rows: mapRows(response.rows ?? []),
          };
          if (requestGeneration === generation) touch(key, normalized);
          return { ...normalized, rows: withDirtyRows(normalized.rows) };
        })
        .finally(() => pending.delete(key));
      pending.set(key, promise);
      return promise;
    },
    clear() {
      generation += 1;
      resolved.clear();
      pending.clear();
    },
    get size() {
      return resolved.size;
    },
  };
}
