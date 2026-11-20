import { useState } from 'react';
import { compileForecastFormula } from '../utils/formula';

export default function NovFormulaDialog({ formula, fields, onApply, onClose }) {
  const [value, setValue] = useState(formula);
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    try {
      compileForecastFormula(value, fields);
      onApply(value.trim());
    } catch (validationError) {
      setError(validationError.message);
    }
  }

  return (
    <dialog open className="modal-backdrop nov-formula-backdrop" aria-modal="true" aria-labelledby="nov-formula-title">
      <section className="bulk-panel nov-formula-panel">
        <h2 id="nov-formula-title">NOV calculated column</h2>
        <p>Use numeric field names and +, −, *, / or parentheses. For example: <strong>OCT_FORECAST * 1.05</strong>.</p>
        <p>Applying a formula alone does not enable Save. When you save a row edit, NOV is updated for every row in this template, including filtered and unloaded rows. The formula is stored only in this browser. Saving is blocked if any row has missing inputs or division by zero.</p>
        <form onSubmit={submit}>
          <label htmlFor="nov-formula">Formula</label>
          <input id="nov-formula" value={value} onChange={(event) => setValue(event.target.value)} placeholder="OCT_FORECAST * 1.05" autoFocus />
          <details className="formula-fields">
            <summary>Available numeric fields</summary>
            <p>{fields.filter((field) => field !== 'NOV_FORECAST').join(', ')}</p>
          </details>
          {error && <p className="formula-error" role="alert">{error}</p>}
          <div className="modal-actions">
            {formula && <button type="button" onClick={() => onApply('')}>Remove formula</button>}
            <button type="button" onClick={onClose}>Cancel</button>
            <button className="primary" type="submit">Apply formula</button>
          </div>
        </form>
      </section>
    </dialog>
  );
}