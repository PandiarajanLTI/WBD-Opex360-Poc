// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AddForecastRowPanel from './AddForecastRowPanel';

const { saveRows } = vi.hoisted(() => ({ saveRows: vi.fn() }));
vi.mock('../services/forecastService', () => ({
  forecastService: { saveRows },
}));

afterEach(() => vi.clearAllMocks());

describe('AddForecastRowPanel', () => {
  it('creates a new forecast row and notifies the page to refresh', async () => {
    saveRows.mockResolvedValue({ message: 'Saved 1 row(s).' });
    const onComplete = vi.fn();
    render(
      <AddForecastRowPanel
        templateName="Warner Media"
        version="10+2"
        onClose={vi.fn()}
        onComplete={onComplete}
      />,
    );
    const values = [
      ['Company code', 'US01'],
      ['Profit center', 'P001'],
      ['Cost center', 'C900'],
      ['FSI account', 'A001'],
      ['Geography', 'NA'],
      ['Brand', 'Studio'],
    ];
    values.forEach(([label, value]) =>
      fireEvent.change(screen.getByLabelText(new RegExp(label, 'i')), {
        target: { value },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save row' }));

    await waitFor(() =>
      expect(saveRows).toHaveBeenCalledWith('Warner Media', [
        {
          UNIQ_ID: -1,
          TEMPLATE_NAME: 'Warner Media',
          VERSION: '10+2',
          FSI_ACCOUNT: 'A001',
          GEOGRAPHY: 'NA',
          BRAND: 'Studio',
          COMPANY_CODE: 'US01',
          COST_CENTER: 'C900',
          PROFIT_CENTER: 'P001',
          CURRENCY: 'USD',
          STATUS: 'Working',
          NOV_FORECAST: 0,
          DEC_FORECAST: 0,
          NOTES: '',
        },
      ]),
    );
    expect(onComplete).toHaveBeenCalledWith('Saved 1 row(s).');
  });
});
