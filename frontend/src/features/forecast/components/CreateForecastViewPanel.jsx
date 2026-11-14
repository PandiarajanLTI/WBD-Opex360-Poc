import { useState } from 'react';

export default function CreateForecastViewPanel({
  columns,
  initialColumnIds,
  onClose,
  onSave,
}) {
  const [name, setName] = useState('');
  const [selectedColumns, setSelectedColumns] = useState(
    () => new Set(initialColumnIds),
  );
  const [error, setError] = useState('');

  const toggleColumn = (columnId, isSelected) => {
    setSelectedColumns((current) => {
      const next = new Set(current);
      if (isSelected) next.add(columnId);
      else next.delete(columnId);
      return next;
    });
  };

  const submit = (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!selectedColumns.size) {
      setError('Select at least one field for this view.');
      return;
    }
    if (!trimmedName) {
      setError('Enter a name for this view.');
      return;
    }
    onSave(trimmedName, [...selectedColumns]);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="create-view-title"
        aria-modal="true"
        className="create-view-panel"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 id="create-view-title">Create New View</h2>
        <form onSubmit={submit}>
          <label className="create-view-name">
            View name
            <input
              autoFocus
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter a view name"
              value={name}
            />
          </label>
          <fieldset className="create-view-fields">
            <legend>Select fields</legend>
            {columns.map((column) => (
              <label key={column.colId}>
                <input
                  checked={selectedColumns.has(column.colId)}
                  onChange={(event) =>
                    toggleColumn(column.colId, event.target.checked)
                  }
                  type="checkbox"
                />
                {column.headerName}
              </label>
            ))}
          </fieldset>
          {error && (
            <div className="error create-view-error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary" type="submit">
              Save View
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
