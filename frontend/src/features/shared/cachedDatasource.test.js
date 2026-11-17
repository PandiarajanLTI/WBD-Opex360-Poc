import { describe, expect, it, vi } from 'vitest';
import { createCachedDatasource } from './cachedDatasource';

const request = (startRow = 0) => ({ startRow, endRow: startRow + 1000, sortModel: [], filterModel: {} });

describe('createCachedDatasource', () => {
  it('reuses a resolved 1000-row block without another HTTP query', async () => {
    const query = vi.fn(async () => ({ rows: [{ UNIQ_ID: 1 }], totalRowCount: 100000 }));
    const cache = createCachedDatasource({ query, maxEntries: 100 });
    await cache.get(request());
    await cache.get(request());
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('coalesces duplicate in-flight block requests', async () => {
    let release;
    const query = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const cache = createCachedDatasource({ query });
    const a = cache.get(request());
    const b = cache.get(request());
    release({ rows: [], totalRowCount: 100000 });
    await Promise.all([a, b]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('isolates sort/filter cache keys', async () => {
    const query = vi.fn(async () => ({ rows: [], totalRowCount: 0 }));
    const cache = createCachedDatasource({ query });
    await cache.get(request());
    await cache.get({ ...request(), sortModel: [{ colId: 'NOV_FORECAST', sort: 'asc' }] });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
