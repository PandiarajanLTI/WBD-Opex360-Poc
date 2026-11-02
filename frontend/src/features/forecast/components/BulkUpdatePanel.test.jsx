import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BulkUpdatePanel from './BulkUpdatePanel';

describe('BulkUpdatePanel', () => {
  it('submits selected field and normalized value', () => {
    const onApply = vi.fn();
    render(
      <BulkUpdatePanel
        selectedCount={3}
        onApply={onApply}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Value'), {
      target: { value: '125' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to rows' }));
    expect(onApply).toHaveBeenCalledWith('NOV_FORECAST', 125);
  });
});
