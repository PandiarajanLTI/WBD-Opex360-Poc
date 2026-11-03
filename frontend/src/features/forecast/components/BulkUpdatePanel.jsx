import { useMemo, useState } from 'react';

const BULK_EDITABLE_FIELDS = [
  { field: 'NOV_FORECAST', label: 'November Forecast', type: 'number' },
  { field: 'DEC_FORECAST', label: 'December Forecast', type: 'number' },
  { field: 'NOTES', label: 'Notes', type: 'text' },
];

export default function BulkUpdatePanel({
  selectedCount,
  onApply,
  onClose,
  fields = BULK_EDITABLE_FIELDS,
}) {
  const [field, setField] = useState(fields[0].field);
  const [value, setValue] = useState('');
  const selectedField = useMemo(
    () => fields.find((item) => item.field === field),
    [fields, field],
  );

  function handleSubmit(event) {
    event.preventDefault();
    const normalizedValue =
      selectedField.type === 'number' ? Number(value) : value;
    onApply(field, normalizedValue);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="bulk-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-update-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="bulk-update-title">Bulk update</h2>
        <p>Apply one value to {selectedCount} selected row(s).</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="bulk-field">Field</label>
          <select
            id="bulk-field"
            value={field}
            onChange={(event) => setField(event.target.value)}
          >
            {fields.map((item) => (
              <option key={item.field} value={item.field}>
                {item.label}
              </option>
            ))}
          </select>
          <label htmlFor="bulk-value">Value</label>
          <input
            id="bulk-value"
            required
            type={selectedField.type}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" type="submit">
              Apply to rows
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
