// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InlineForecastCell from './InlineForecastCell';

afterEach(cleanup);

describe('InlineForecastCell', () => {
  it('forwards typed values to the pinned row without replacing its data', () => {
    const onInlineRowChange = vi.fn();
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <InlineForecastCell
          colDef={{
            field: 'COMPANY_CODE',
            headerName: 'Company Code',
            editable: true,
          }}
          context={{ onInlineRowChange }}
          data={{
            __INLINE_NEW_ROW_ID: -100000000,
            COMPANY_CODE: '',
            INSERTED: 'Y',
          }}
        />
      </div>,
    );

    const input = screen.getByLabelText('New row Company Code');
    fireEvent.change(input, {
      target: { value: 'US02' },
    });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Backspace' });

    expect(onInlineRowChange).toHaveBeenNthCalledWith(
      1,
      -100000000,
      'COMPANY_CODE',
      'US02',
    );
    expect(onInlineRowChange).toHaveBeenLastCalledWith(
      -100000000,
      'COMPANY_CODE',
      '',
    );
    expect(input.value).toBe('');
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('forwards spreadsheet paste data and the pinned row node', () => {
    const node = { setDataValue: vi.fn() };
    const onInlineRowPaste = vi.fn(() => ({ COMPANY_CODE: 'US02' }));
    render(
      <InlineForecastCell
        api={{}}
        colDef={{
          field: 'COMPANY_CODE',
          headerName: 'Company Code',
          editable: true,
        }}
        context={{ onInlineRowPaste }}
        data={{
          __INLINE_NEW_ROW_ID: -100000000,
          COMPANY_CODE: '',
          INSERTED: 'Y',
        }}
        node={node}
      />,
    );
    const input = screen.getByLabelText('New row Company Code');

    fireEvent.paste(input, {
      clipboardData: { getData: () => 'Company Code\tBrand\nUS02\tStudio A' },
    });

    expect(onInlineRowPaste).toHaveBeenCalledWith(
      expect.objectContaining({
        inlineId: -100000000,
        field: 'COMPANY_CODE',
        text: 'Company Code\tBrand\nUS02\tStudio A',
        node,
      }),
    );
    expect(input.value).toBe('US02');
  });
});
