const REQUIRED_DIMENSIONS = [
  ['GEOGRAPHY', 'Geo'],
  ['BRAND', 'Brand'],
  ['PROFIT_CENTER', 'Profit Center'],
  ['FSI_ACCOUNT', 'FSI'],
  ['COST_CENTER', 'Cost Center'],
  ['COMPANY_CODE', 'Company Code'],
];

export default function RequiredDimensionsDialog({
  values,
  isLoading,
  error,
  onClose,
}) {
  return (
    <div
      className="required-dimensions-backdrop"
      onMouseDown={onClose}
      role="presentation"
    >
      <section
        aria-labelledby="required-dimensions-title"
        aria-modal="true"
        className="required-dimensions-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="required-dimensions-header">
          <div>
            <div className="required-dimensions-title-row">
              <h2 id="required-dimensions-title">Required Dimensions</h2>
              <span className="always-included-badge">
                <span aria-hidden="true">🔒</span> Always Included
              </span>
            </div>
            <p>These dimensions are always included.</p>
          </div>
          <button
            aria-label="Close required dimensions"
            className="required-dimensions-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="required-dimensions-content">
          {isLoading && (
            <p className="required-dimensions-status" role="status">
              Loading required dimensions…
            </p>
          )}
          {error && (
            <p className="required-dimensions-error" role="alert">
              {error}
            </p>
          )}
          {!isLoading &&
            !error &&
            REQUIRED_DIMENSIONS.map(([field, label]) => (
              <div className="required-dimension-row" key={field}>
                <span className="required-dimension-label">
                  <span aria-hidden="true">🔒</span>
                  {label}
                </span>
                <select
                  aria-label={label}
                  disabled
                  value={values?.[field] ?? ''}
                >
                  <option value="">
                    {values?.[field] == null ? 'No value' : ''}
                  </option>
                  {values?.[field] != null && (
                    <option value={values[field]}>{values[field]}</option>
                  )}
                </select>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
