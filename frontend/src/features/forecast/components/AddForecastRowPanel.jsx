import { useState } from 'react';
import { forecastService } from '../services/forecastService';

const REQUIRED_FIELDS = [
  ['COMPANY_CODE', 'Company code'],
  ['PROFIT_CENTER', 'Profit center'],
  ['COST_CENTER', 'Cost center'],
  ['FSI_ACCOUNT', 'FSI account'],
  ['GEOGRAPHY', 'Geography'],
  ['BRAND', 'Brand'],
];

export default function AddForecastRowPanel({
  templateName,
  version,
  initialData,
  onClose,
  onComplete,
}) {
  const [values, setValues] = useState(() => ({
    ...Object.fromEntries(REQUIRED_FIELDS.map(([field]) => [field, ''])),
    CURRENCY: 'USD',
    STATUS: 'Working',
    NOTES: '',
    NOV_FORECAST: '0',
    DEC_FORECAST: '0',
    ...initialData,
  }));
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const update = (field, value) =>
    setValues((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    const row = {
      UNIQ_ID: -1,
      TEMPLATE_NAME: templateName,
      VERSION: version,
      FSI_ACCOUNT: values.FSI_ACCOUNT,
      GEOGRAPHY: values.GEOGRAPHY,
      BRAND: values.BRAND,
      COMPANY_CODE: values.COMPANY_CODE,
      COST_CENTER: values.COST_CENTER,
      PROFIT_CENTER: values.PROFIT_CENTER,
      CURRENCY: values.CURRENCY || 'USD',
      STATUS: values.STATUS || 'Working',
      NOV_FORECAST: Number(values.NOV_FORECAST || 0),
      DEC_FORECAST: Number(values.DEC_FORECAST || 0),
      NOTES: values.NOTES,
    };
    try {
      const result = await forecastService.saveRows(templateName, [row]);
      onComplete(result.message);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog aria-modal="true" className="template-dialog-overlay" open>
      <section aria-labelledby="add-row-title" className="template-dialog">
        <div className="template-dialog-heading">
          <div>
            <span className="dialog-eyebrow">{templateName}</span>
            <h2 id="add-row-title">
              {initialData ? 'Duplicate forecast row' : 'Add forecast row'}
            </h2>
            <p>
              Enter the required dimensions, then save this row to the forecast.
            </p>
          </div>
          <button
            aria-label="Close dialog"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <form className="template-dialog-form" onSubmit={submit}>
          <div className="template-form-grid">
            {REQUIRED_FIELDS.map(([field, label]) => (
              <label className="form-field" key={field}>
                <span>
                  {label} <b>*</b>
                </span>
                <input
                  maxLength="120"
                  onChange={(event) => update(field, event.target.value)}
                  required
                  value={values[field] ?? ''}
                />
              </label>
            ))}
            <label className="form-field">
              <span>November forecast</span>
              <input
                onChange={(event) => update('NOV_FORECAST', event.target.value)}
                type="number"
                value={values.NOV_FORECAST ?? 0}
              />
            </label>
            <label className="form-field">
              <span>December forecast</span>
              <input
                onChange={(event) => update('DEC_FORECAST', event.target.value)}
                type="number"
                value={values.DEC_FORECAST ?? 0}
              />
            </label>
            <label className="form-field form-field-wide">
              <span>Notes</span>
              <input
                maxLength="1000"
                onChange={(event) => update('NOTES', event.target.value)}
                value={values.NOTES ?? ''}
              />
            </label>
          </div>
          {error && (
            <div className="error template-dialog-error" role="alert">
              {error}
            </div>
          )}
          <div className="template-dialog-actions">
            <button className="dialog-cancel" onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="template-submit-button"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? 'Saving…' : 'Save row'}
            </button>
          </div>
        </form>
      </section>
    </dialog>
  );
}
