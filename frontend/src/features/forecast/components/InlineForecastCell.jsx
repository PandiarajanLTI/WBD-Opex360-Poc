import { useEffect, useState } from 'react';

const REQUIRED_INLINE_FIELDS = new Set([
  'COMPANY_CODE',
  'PROFIT_CENTER',
  'COST_CENTER',
  'FSI_ACCOUNT',
  'GEOGRAPHY',
  'BRAND',
  'CURRENCY',
]);
const READ_ONLY_INLINE_FIELDS = new Set([
  'UNIQ_ID',
  'ID',
  'ALL_DIM_ID',
  'TEMPLATE_PRIMARY_KEY',
  'UPDATED_TS',
  'FY_WORKING_FORECAST',
  'FY_WORKING_FORECAST_PRATE',
  'FX_RATE',
  'FX_RATE_TYPE',
  'FX_YEAR',
]);

export default function InlineForecastCell(params) {
  const { colDef, data, node, context } = params;
  const field = colDef.field;
  const rowValue = data?.[field] ?? '';
  const [value, setValue] = useState(rowValue);
  const label = colDef.headerName ?? field ?? '';
  useEffect(() => {
    setValue(rowValue);
  }, [rowValue]);
  let editable =
    Boolean(field) &&
    !READ_ONLY_INLINE_FIELDS.has(field) &&
    !colDef.context?.calculated;
  if (editable && typeof colDef.editable === 'function') {
    editable = colDef.editable({ ...params, data, node });
  } else if (editable && colDef.editable !== undefined) {
    editable = colDef.editable === true;
  }

  if (field === 'TEMPLATE_NAME') {
    const inlineId = data.__INLINE_NEW_ROW_ID;
    return (
      <div className="inline-new-row-cell">
        <strong className="inline-new-row-label">New row</strong>
        <button
          aria-label={`Remove new row ${Math.abs(inlineId)}`}
          className="inline-new-row-remove"
          disabled={context.isInlineRowSaving}
          onClick={(event) => {
            event.stopPropagation();
            context.onRemoveInlineRow?.(inlineId);
          }}
          type="button"
        >
          ×
        </button>
      </div>
    );
  }
  if (field === 'VERSION') return <span>{data.VERSION}</span>;
  if (!editable) return null;

  const handlePaste = (event) => {
    event.stopPropagation();
    const text = event.clipboardData?.getData('text');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
    event.preventDefault();
    const changes = context.onInlineRowPaste?.({
      event,
      inlineId: data.__INLINE_NEW_ROW_ID,
      text,
      field,
      api: params.api,
      node,
    });
    if (changes && Object.hasOwn(changes, field)) {
      setValue(changes[field] ?? '');
    }
  };

  return (
    <input
      aria-label={`New row ${label}`}
      className="inline-grid-cell-input"
      disabled={context.isInlineRowSaving}
      onChange={(event) => {
        const nextValue = event.target.value;
        setValue(nextValue);
        context.onInlineRowChange?.(data.__INLINE_NEW_ROW_ID, field, nextValue);
      }}
      onKeyDownCapture={(event) => event.stopPropagation()}
      onPaste={handlePaste}
      required={REQUIRED_INLINE_FIELDS.has(field)}
      type={colDef.type === 'numericColumn' ? 'number' : 'text'}
      value={value}
    />
  );
}
