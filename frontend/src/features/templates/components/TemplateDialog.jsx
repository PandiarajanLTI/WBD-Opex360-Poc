import { useState } from 'react';
import { apiJson } from '../../../services/api/apiClient';

const emptyTemplate = {
  templateName: '',
  section: 'Forecast',
  version: '10+2',
  status: 'Working',
  currentForecast: '0',
  priorForecast: '0',
  variance: '0',
};

function readCsvRecords(text) {
  const records = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      value += '"';
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === ',' && !quoted) {
      row.push(value.trim());
      value = '';
      continue;
    }
    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) records.push(row);
      row = [];
      value = '';
      continue;
    }
    value += character;
  }
  row.push(value.trim());
  if (row.some(Boolean)) records.push(row);
  return records;
}

function normalizeHeader(header) {
  return header
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findColumn(headers, ...names) {
  return names
    .map(normalizeHeader)
    .map((name) => headers.indexOf(name))
    .find((index) => index >= 0);
}

function readColumn(cells, index, fallback = '') {
  return index === undefined ? fallback : (cells[index] ?? fallback);
}

function readNumber(raw, label, rowNumber) {
  const parsed = Number(String(raw).replace(/[$,]/g, '').trim() || 0);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number on CSV row ${rowNumber}.`);
  }
  return parsed;
}

function parseCsv(text) {
  const records = readCsvRecords(text);
  if (records.length < 2)
    throw new Error(
      'The CSV must include a header and at least one template row.',
    );
  const headers = records[0].map(normalizeHeader);
  const nameColumn = findColumn(
    headers,
    'templateName',
    'template name',
    'template',
  );
  const versionColumn = findColumn(headers, 'version');
  if (nameColumn === undefined || versionColumn === undefined) {
    throw new Error('CSV headers must include Template Name and Version.');
  }
  const sectionColumn = findColumn(headers, 'section');
  const statusColumn = findColumn(headers, 'status');
  const currentColumn = findColumn(
    headers,
    'currentForecast',
    'current forecast',
  );
  const priorColumn = findColumn(headers, 'priorForecast', 'prior forecast');
  const varianceColumn = findColumn(headers, 'variance');

  return records.slice(1).map((cells, index) => ({
    templateName: readColumn(cells, nameColumn),
    section: readColumn(cells, sectionColumn, 'Forecast') || 'Forecast',
    version: readColumn(cells, versionColumn),
    status: readColumn(cells, statusColumn, 'Working') || 'Working',
    currentForecast: readNumber(
      readColumn(cells, currentColumn, '0'),
      'Current Forecast',
      index + 2,
    ),
    priorForecast: readNumber(
      readColumn(cells, priorColumn, '0'),
      'Prior Forecast',
      index + 2,
    ),
    variance: readNumber(
      readColumn(cells, varianceColumn, '0'),
      'Variance',
      index + 2,
    ),
  }));
}

export default function TemplateDialog({ mode, onClose, onComplete }) {
  const [template, setTemplate] = useState(emptyTemplate);
  const [fileRows, setFileRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isUpload = mode === 'upload';
  let submitLabel = 'Create template';
  if (isUpload) submitLabel = 'Upload templates';
  if (isSaving) submitLabel = 'Saving…';

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    setError('');
    setFileRows([]);
    setFileName(file?.name ?? '');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Choose a .csv file. Excel files are not supported yet.');
      return;
    }
    try {
      setFileRows(parseCsv(await file.text()));
    } catch (fileError) {
      setError(fileError.message);
    }
  };

  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const controls = [
      ...event.currentTarget.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled)',
      ),
    ];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      if (isUpload) {
        await apiJson('/templates/upload', {
          method: 'POST',
          body: JSON.stringify({ rows: fileRows }),
        });
        onComplete(`${fileRows.length} template(s) uploaded successfully.`);
      } else {
        await apiJson('/templates', {
          method: 'POST',
          body: JSON.stringify({
            ...template,
            currentForecast: Number(template.currentForecast),
            priorForecast: Number(template.priorForecast),
            variance: Number(template.variance),
          }),
        });
        onComplete(`Template “${template.templateName}” created successfully.`);
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog
      aria-modal="true"
      className="template-dialog-overlay"
      onKeyDown={handleDialogKeyDown}
      open
    >
      <section
        aria-labelledby="template-dialog-title"
        className="template-dialog"
      >
        <div className="template-dialog-heading">
          <div>
            <span className="dialog-eyebrow">FORECAST WORKSPACE</span>
            <h2 id="template-dialog-title">
              {isUpload ? 'Upload templates' : 'Create template'}
            </h2>
            <p>
              {isUpload
                ? 'Import multiple forecast versions from a CSV file.'
                : 'Set up a new forecast version to add to your workspace.'}
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
          {isUpload ? (
            <>
              <label className="upload-dropzone">
                <span className="upload-icon" aria-hidden="true">
                  ↑
                </span>
                <strong>{fileName || 'Choose a CSV file to upload'}</strong>
                <span>CSV format · up to 500 template rows</span>
                <input
                  accept=".csv,text/csv"
                  autoFocus
                  onChange={handleFile}
                  type="file"
                />
              </label>
              <p className="csv-help">
                Required columns: <b>Template Name</b> and <b>Version</b>.
                Optional: Section, Status, Current Forecast, Prior Forecast,
                Variance.
              </p>
              {fileRows.length > 0 && (
                <output className="upload-ready">
                  {fileRows.length} template row(s) ready to import.
                </output>
              )}
            </>
          ) : (
            <div className="template-form-grid">
              <label className="form-field form-field-wide">
                <span>
                  Template name <b>*</b>
                </span>
                <input
                  autoFocus
                  maxLength="120"
                  onChange={(event) =>
                    setTemplate({
                      ...template,
                      templateName: event.target.value,
                    })
                  }
                  placeholder="e.g. North America Marketing"
                  required
                  value={template.templateName}
                />
              </label>
              <label className="form-field">
                <span>Section</span>
                <input
                  maxLength="80"
                  onChange={(event) =>
                    setTemplate({ ...template, section: event.target.value })
                  }
                  required
                  value={template.section}
                />
              </label>
              <label className="form-field">
                <span>Version</span>
                <input
                  maxLength="40"
                  onChange={(event) =>
                    setTemplate({ ...template, version: event.target.value })
                  }
                  required
                  value={template.version}
                />
              </label>
              <label className="form-field">
                <span>Current forecast ($)</span>
                <input
                  min="0"
                  onChange={(event) =>
                    setTemplate({
                      ...template,
                      currentForecast: event.target.value,
                    })
                  }
                  type="number"
                  value={template.currentForecast}
                />
              </label>
              <label className="form-field">
                <span>Prior forecast ($)</span>
                <input
                  min="0"
                  onChange={(event) =>
                    setTemplate({
                      ...template,
                      priorForecast: event.target.value,
                    })
                  }
                  type="number"
                  value={template.priorForecast}
                />
              </label>
              <label className="form-field">
                <span>Status</span>
                <select
                  onChange={(event) =>
                    setTemplate({ ...template, status: event.target.value })
                  }
                  value={template.status}
                >
                  <option>Working</option>
                  <option>Final</option>
                  <option>Draft</option>
                </select>
              </label>
            </div>
          )}

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
              disabled={isSaving || (isUpload && fileRows.length === 0)}
              type="submit"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </section>
    </dialog>
  );
}
