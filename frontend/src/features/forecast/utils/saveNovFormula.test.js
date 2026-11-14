import { describe, expect, it, vi } from 'vitest';
import { buildNovFormulaPayload } from './saveNovFormula';

describe('buildNovFormulaPayload', () => {
  const options = { templateName: 'T', calculate: (row) => row.OCT_FORECAST ?? null, dirtyRows: [] };

  it('fails rather than saving an incomplete or changing page', async () => {
    const queryRows = vi.fn().mockResolvedValue({ rows: [], totalRowCount: 1 });
    await expect(buildNovFormulaPayload({ ...options, queryRows })).rejects.toThrow('Could not load every');
  });

  it('fails when an edited existing row is absent', async () => {
    const queryRows = vi.fn().mockResolvedValue({ rows: [], totalRowCount: 0 });
    await expect(buildNovFormulaPayload({ ...options, dirtyRows: [{ UNIQ_ID: 2, OCT_FORECAST: 3 }], queryRows })).rejects.toThrow('not found');
  });

  it('includes pending inserted rows with their calculated value', async () => {
    const queryRows = vi.fn().mockResolvedValue({ rows: [], totalRowCount: 0 });
    const result = await buildNovFormulaPayload({ ...options, dirtyRows: [{ UNIQ_ID: -1, OCT_FORECAST: 3, __editedFields: ['OCT_FORECAST'] }], queryRows });
    expect(result).toEqual([{ UNIQ_ID: -1, OCT_FORECAST: 3, NOV_FORECAST: 3 }]);
  });
});