const clone = (value) => globalThis.structuredClone
  ? globalThis.structuredClone(value)
  : canonicalize(value); // JSON-only fallback for environments without structuredClone.

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

/**
 * fetchRows(request) returns JSON { rows, totalRowCount, ...metadata }.
 * decorateRows(rows, params) runs on a private copy for every delivery.
 * onResult(result, params) receives that decorated copy; onError(error, params)
 * runs per failed consumer. Loading reports aggregate idle/busy transitions.
 * Invalidation suppresses old callbacks, but does not cancel network work.
 */
export function createCachedDatasource({
  fetchRows,
  decorateRows = (rows) => rows,
  onResult = () => {},
  onError = () => {},
  onLoadingChange = () => {},
}) {
  const resolved = new Map();
  const pending = new Map();
  let generation = 0;
  let activeRequests = 0;

  function changeLoading(delta) {
    const wasLoading = activeRequests > 0;
    activeRequests += delta;
    const isLoading = activeRequests > 0;
    if (wasLoading !== isLoading) onLoadingChange(isLoading);
  }

  function fail(params, error, requestGeneration) {
    if (requestGeneration !== generation) return;
    params.failCallback();
    if (requestGeneration === generation) onError(error, params);
  }

  function deliver(params, raw, requestGeneration) {
    if (requestGeneration !== generation) return;
    try {
      const result = clone(raw);
      result.rows = decorateRows(result.rows, params);
      if (requestGeneration !== generation) return;
      params.successCallback(result.rows, result.totalRowCount);
      if (requestGeneration === generation) onResult(result, params);
    } catch (error) {
      // Consumer/decoration failures must never evict a successful raw result.
      fail(params, error, requestGeneration);
    }
  }

  function getRows(params) {
    const request = {
      startRow: params.startRow,
      endRow: params.endRow,
      sortModel: params.sortModel,
      filterModel: params.filterModel,
    };
    const key = JSON.stringify(canonicalize(request));
    if (resolved.has(key)) {
      deliver(params, resolved.get(key), generation);
      return;
    }
    if (pending.has(key)) {
      pending.get(key).waiters.push(params);
      return pending.get(key).promise;
    }

    const entry = { generation, waiters: [params] };
    pending.set(key, entry);
    changeLoading(1);
    // The promise boundary makes even synchronous throws/results asynchronous.
    entry.promise = Promise.resolve().then(() => fetchRows(request)).then(
      (result) => {
        if (entry.generation !== generation) return;
        let raw;
        try {
          raw = clone(result);
        } catch (error) {
          pending.delete(key);
          entry.waiters.forEach((waiter) => fail(waiter, error, entry.generation));
          return;
        }
        resolved.set(key, raw);
        pending.delete(key);
        entry.waiters.forEach((waiter) => deliver(waiter, raw, entry.generation));
      },
      (error) => {
        if (entry.generation !== generation) return;
        pending.delete(key);
        entry.waiters.forEach((waiter) => fail(waiter, error, entry.generation));
      },
    ).finally(() => changeLoading(-1));
    return entry.promise;
  }

  function invalidate() {
    generation += 1;
    resolved.clear();
    pending.clear();
  }

  return { getRows, invalidate };
}