// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createCachedDatasource } from './cachedDatasource';

const result = () => ({
  rows: [{ id: 1, nested: { amount: 10 } }],
  totalRowCount: 123,
  metadata: { currency: 'USD' },
});

function params(overrides = {}) {
  return {
    startRow: 0,
    endRow: 100,
    sortModel: [],
    filterModel: {},
    successCallback: vi.fn(),
    failCallback: vi.fn(),
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Drain the fetch, delivery and finally promise boundaries without DOM/timers.
async function settle() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe('createCachedDatasource', () => {
  it('delivers the first result asynchronously and sequential cache hits synchronously', async () => {
    const raw = result();
    const fetchRows = vi.fn(() => raw);
    const onResult = vi.fn();
    const onLoadingChange = vi.fn();
    const datasource = createCachedDatasource({ fetchRows, onResult, onLoadingChange });
    const first = params();

    datasource.getRows(first);
    expect(first.successCallback).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
    await settle();
    expect(first.successCallback).toHaveBeenCalledWith(raw.rows, 123);
    expect(fetchRows).toHaveBeenCalledWith({
      startRow: 0, endRow: 100, sortModel: [], filterModel: {},
    });
    onResult.mockClear();
    onLoadingChange.mockClear();

    const cached = params();
    datasource.getRows(cached);
    expect(cached.successCallback).toHaveBeenCalledWith(raw.rows, 123);
    expect(onResult).toHaveBeenCalledWith(raw, cached);
    expect(fetchRows).toHaveBeenCalledTimes(1);
    expect(onLoadingChange).not.toHaveBeenCalled();
  });

  it('coalesces pending requests and decorates independently for every callback', async () => {
    const network = deferred();
    const fetchRows = vi.fn(() => network.promise);
    let edit = 20;
    const decorateRows = vi.fn((rows) => {
      rows[0].nested.amount = edit++;
      return rows;
    });
    const onResult = vi.fn();
    const onLoadingChange = vi.fn();
    const datasource = createCachedDatasource({ fetchRows, decorateRows, onResult, onLoadingChange });
    const first = params();
    const second = params();
    datasource.getRows(first);
    datasource.getRows(second);
    await settle();
    expect(fetchRows).toHaveBeenCalledTimes(1);
    expect(onLoadingChange.mock.calls).toEqual([[true]]);

    network.resolve(result());
    await settle();
    expect(first.successCallback.mock.calls[0][0][0].nested.amount).toBe(20);
    expect(second.successCallback.mock.calls[0][0][0].nested.amount).toBe(21);
    const cached = params();
    datasource.getRows(cached);
    expect(cached.successCallback.mock.calls[0][0][0].nested.amount).toBe(22);
    expect(decorateRows).toHaveBeenCalledTimes(3);
    expect(onResult).toHaveBeenCalledTimes(3);
    expect(onLoadingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('canonicalizes nested object keys, including objects inside arrays', async () => {
    const fetchRows = vi.fn(() => result());
    const datasource = createCachedDatasource({ fetchRows });
    datasource.getRows(params({
      sortModel: [{ colId: 'amount', sort: 'asc' }],
      filterModel: { b: { type: 'set', values: [{ x: 1, y: 2 }] }, a: null },
    }));
    await settle();
    const cached = params({
      sortModel: [{ sort: 'asc', colId: 'amount' }],
      filterModel: { a: null, b: { values: [{ y: 2, x: 1 }], type: 'set' } },
    });
    datasource.getRows(cached);
    expect(cached.successCallback).toHaveBeenCalledTimes(1);
    expect(fetchRows).toHaveBeenCalledTimes(1);
  });

  it.each([
    { startRow: 100 },
    { endRow: 200 },
    { sortModel: [{ colId: 'a', sort: 'desc' }] },
    { filterModel: { a: { filter: 2 } } },
  ])('separates queries with changed fields: %j', async (override) => {
    const fetchRows = vi.fn(() => result());
    const datasource = createCachedDatasource({ fetchRows });
    datasource.getRows(params());
    await settle();
    datasource.getRows(params(override));
    await settle();
    expect(fetchRows).toHaveBeenCalledTimes(2);
  });

  it('retains sort and filter array ordering in cache keys', async () => {
    const fetchRows = vi.fn(() => result());
    const datasource = createCachedDatasource({ fetchRows });
    const a = { colId: 'a', sort: 'asc' };
    const b = { colId: 'b', sort: 'desc' };
    datasource.getRows(params({ sortModel: [a, b], filterModel: { values: [1, 2] } }));
    datasource.getRows(params({ sortModel: [b, a], filterModel: { values: [1, 2] } }));
    datasource.getRows(params({ sortModel: [a, b], filterModel: { values: [2, 1] } }));
    await settle();
    expect(fetchRows).toHaveBeenCalledTimes(3);
  });

  it('isolates cached storage from original responses, grid edits, and result hooks', async () => {
    const raw = result();
    const fetchRows = vi.fn(() => raw);
    const onResult = vi.fn((delivered) => {
      delivered.metadata.currency = 'EUR';
      delivered.rows[0].nested.amount = 99;
    });
    const datasource = createCachedDatasource({ fetchRows, onResult });
    const first = params();
    datasource.getRows(first);
    await settle();
    expect(raw).toEqual(result());
    raw.rows[0].nested.amount = 50;
    raw.metadata.currency = 'GBP';
    first.successCallback.mock.calls[0][0][0].nested.amount = 77;
    onResult.mockImplementation(() => {});

    const cached = params();
    datasource.getRows(cached);
    expect(cached.successCallback).toHaveBeenCalledWith(result().rows, 123);
    expect(onResult).toHaveBeenLastCalledWith(result(), cached);
    expect(cached.successCallback.mock.calls[0][0]).not.toBe(first.successCallback.mock.calls[0][0]);
  });

  it('keeps successful raw cache when one consumer decoration throws', async () => {
    const network = deferred();
    const error = new Error('decoration failed');
    const fetchRows = vi.fn(() => network.promise);
    const decorateRows = vi.fn().mockImplementationOnce(() => { throw error; })
      .mockImplementation((rows) => rows);
    const onError = vi.fn();
    const datasource = createCachedDatasource({ fetchRows, decorateRows, onError });
    const first = params();
    const second = params();
    datasource.getRows(first);
    datasource.getRows(second);
    network.resolve(result());
    await settle();
    expect(first.failCallback).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(error, first);
    expect(second.successCallback).toHaveBeenCalledOnce();

    decorateRows.mockImplementationOnce(() => { throw error; });
    const failedHit = params();
    datasource.getRows(failedHit);
    expect(failedHit.failCallback).toHaveBeenCalledOnce();
    const recovered = params();
    datasource.getRows(recovered);
    expect(recovered.successCallback).toHaveBeenCalledOnce();
    expect(fetchRows).toHaveBeenCalledOnce();
  });

  it.each(['throw', 'reject'])('fans out %s failures asynchronously and permits retry', async (mode) => {
    const error = new Error('network failed');
    const fetchRows = vi.fn().mockImplementationOnce(() => {
      if (mode === 'throw') throw error;
      return Promise.reject(error);
    }).mockResolvedValue(result());
    const onError = vi.fn();
    const onLoadingChange = vi.fn();
    const datasource = createCachedDatasource({ fetchRows, onError, onLoadingChange });
    const first = params();
    const second = params();
    datasource.getRows(first);
    datasource.getRows(second);
    expect(first.failCallback).not.toHaveBeenCalled();
    await settle();
    for (const consumer of [first, second]) {
      expect(consumer.failCallback).toHaveBeenCalledOnce();
      expect(consumer.successCallback).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(error, consumer);
    }
    expect(onError).toHaveBeenCalledTimes(2);
    const retry = params();
    datasource.getRows(retry);
    await settle();
    expect(retry.successCallback).toHaveBeenCalledOnce();
    expect(fetchRows).toHaveBeenCalledTimes(2);
    expect(onLoadingChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('clears resolved results on invalidation', async () => {
    const fetchRows = vi.fn(() => result());
    const datasource = createCachedDatasource({ fetchRows });
    datasource.getRows(params());
    await settle();
    datasource.invalidate();
    const next = params();
    datasource.getRows(next);
    expect(next.successCallback).not.toHaveBeenCalled();
    await settle();
    expect(fetchRows).toHaveBeenCalledTimes(2);
    expect(next.successCallback).toHaveBeenCalledOnce();
  });

  it.each(['resolve', 'reject'])('ignores late old %s without replacing new pending work', async (outcome) => {
    const old = deferred();
    const fresh = deferred();
    const fetchRows = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const onResult = vi.fn();
    const onError = vi.fn();
    const onLoadingChange = vi.fn();
    const datasource = createCachedDatasource({ fetchRows, onResult, onError, onLoadingChange });
    const stale = params();
    datasource.getRows(stale);
    await settle();
    datasource.invalidate();
    const next = params();
    datasource.getRows(next);
    await settle();
    if (outcome === 'resolve') old.resolve(result());
    else old.reject(new Error('stale failure'));
    await settle();
    expect(stale.successCallback).not.toHaveBeenCalled();
    expect(stale.failCallback).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onLoadingChange.mock.calls).toEqual([[true]]);

    const coalesced = params();
    datasource.getRows(coalesced);
    fresh.resolve({ rows: [{ id: 2 }], totalRowCount: 1 });
    await settle();
    expect(fetchRows).toHaveBeenCalledTimes(2);
    for (const consumer of [next, coalesced]) {
      expect(consumer.successCallback).toHaveBeenCalledWith([{ id: 2 }], 1);
    }
    expect(onLoadingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('keeps loading until old work settles and never overwrites a newer cached result', async () => {
    const old = deferred();
    const fetchRows = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(result());
    const onLoadingChange = vi.fn();
    const onResult = vi.fn();
    const datasource = createCachedDatasource({ fetchRows, onLoadingChange, onResult });
    const stale = params();
    datasource.getRows(stale);
    await settle();
    datasource.invalidate();
    datasource.getRows(params());
    await settle();
    expect(onLoadingChange.mock.calls).toEqual([[true]]);
    old.resolve({ rows: [{ id: 'stale' }], totalRowCount: 1 });
    await settle();
    const cached = params();
    datasource.getRows(cached);
    expect(cached.successCallback).toHaveBeenCalledWith(result().rows, 123);
    expect(stale.successCallback).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledTimes(2);
    expect(onLoadingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('tracks overlapping distinct misses without loading events for pending or resolved hits', async () => {
    const first = deferred();
    const second = deferred();
    const fetchRows = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onLoadingChange = vi.fn();
    const datasource = createCachedDatasource({ fetchRows, onLoadingChange });
    datasource.getRows(params());
    datasource.getRows(params());
    datasource.getRows(params({ startRow: 100, endRow: 200 }));
    first.resolve(result());
    await settle();
    datasource.getRows(params());
    expect(onLoadingChange.mock.calls).toEqual([[true]]);
    second.resolve(result());
    await settle();
    expect(fetchRows).toHaveBeenCalledTimes(2);
    expect(onLoadingChange.mock.calls).toEqual([[true], [false]]);
  });
});