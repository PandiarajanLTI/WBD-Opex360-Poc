// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CreateForecastViewPanel from './CreateForecastViewPanel';

afterEach(cleanup);

describe('CreateForecastViewPanel', () => {
  it('saves a named view with selected fields', () => {
    const onSave = vi.fn();
    render(
      <CreateForecastViewPanel
        columns={[
          { colId: 'FSI_ACCOUNT', headerName: 'FSI Account' },
          { colId: 'GEOGRAPHY', headerName: 'Region' },
        ]}
        initialColumnIds={['FSI_ACCOUNT']}
        onClose={() => {}}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText('View name'), {
      target: { value: 'My regional view' },
    });
    fireEvent.click(screen.getByLabelText('Region'));
    fireEvent.click(screen.getByRole('button', { name: 'Save View' }));

    expect(onSave).toHaveBeenCalledWith('My regional view', [
      'FSI_ACCOUNT',
      'GEOGRAPHY',
    ]);
  });

  it('requires at least one selected field', () => {
    render(
      <CreateForecastViewPanel
        columns={[{ colId: 'FSI_ACCOUNT', headerName: 'FSI Account' }]}
        initialColumnIds={[]}
        onClose={() => {}}
        onSave={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('View name'), {
      target: { value: 'No fields' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save View' }));
    expect(
      screen.getByText('Select at least one field for this view.'),
    ).toBeTruthy();
  });
});
