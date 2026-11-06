import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forecastService } from './forecastService';
beforeEach(() => {
  global.fetch = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [], totalRowCount: 0 }),
    });
});
describe('forecast service', () => {
  it('sends the grid contract', async () => {
    await forecastService.queryRows('Template A', {
      startRow: 0,
      endRow: 100,
      sortModel: [],
      filterModel: {},
    });
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0][1].body).endRow).toBe(100);
  });

  it('shares concurrent identical grid requests', async () => {
    const request = {
      startRow: 0,
      endRow: 100,
      sortModel: [],
      filterModel: {},
    };

    await Promise.all([
      forecastService.queryRows('Template A', request),
      forecastService.queryRows('Template A', request),
    ]);

    expect(fetch).toHaveBeenCalledOnce();
  });

  it('shares concurrent metadata requests', async () => {
    await Promise.all([
      forecastService.getMetadata('Template A'),
      forecastService.getMetadata('Template A'),
    ]);

    expect(fetch).toHaveBeenCalledOnce();
  });
});
