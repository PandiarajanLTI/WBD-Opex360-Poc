import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson } from '../../../services/api/apiClient';
import TemplateDialog from '../components/TemplateDialog';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export default function LandingPage() {
  const [state, setState] = useState({ items: [], isLoading: true, error: '' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [managerView, setManagerView] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiJson('/templates')
      .then((items) => setState({ items, isLoading: false, error: '' }))
      .catch((error) =>
        setState({ items: [], isLoading: false, error: error.message }),
      );
  }, []);

  const totals = useMemo(
    () =>
      state.items.reduce(
        (sum, template) => ({
          current: sum.current + Number(template.currentForecast || 0),
          prior: sum.prior + Number(template.priorForecast || 0),
          variance: sum.variance + Number(template.variance || 0),
        }),
        { current: 0, prior: 0, variance: 0 },
      ),
    [state.items],
  );
  const statuses = useMemo(
    () =>
      [...new Set(state.items.map((item) => item.status))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [state.items],
  );
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return state.items.filter((item) => {
      const matchesSearch =
        `${item.templateName} ${item.section} ${item.version}`
          .toLowerCase()
          .includes(query);
      return (
        matchesSearch &&
        (statusFilter === 'All Status' || item.status === statusFilter)
      );
    });
  }, [search, state.items, statusFilter]);

  const finishTemplateAction = async (notice) => {
    setDialog(null);
    setMessage(notice);
    try {
      const items = await apiJson('/templates');
      setState({ items, isLoading: false, error: '' });
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };

  if (state.isLoading) {
    return (
      <div className="panel loading-panel">
        <output>Loading forecast versions…</output>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="forecast-dashboard">
        <div className="error">{state.error}</div>
      </div>
    );
  }

  return (
    <div className="forecast-dashboard">
      {dialog && (
        <TemplateDialog
          mode={dialog}
          onClose={() => setDialog(null)}
          onComplete={finishTemplateAction}
        />
      )}
      <section className="summary-strip" aria-label="Forecast summary">
        <article className="summary-card">
          <div>
            <span className="summary-label">Current Forecast</span>
            <strong>{currency.format(totals.current)}</strong>
            <small>{state.items.length} forecast versions</small>
          </div>
          <span
            className="summary-icon summary-icon-current"
            aria-hidden="true"
          >
            ↗
          </span>
        </article>
        <article className="summary-card">
          <div>
            <span className="summary-label">Prior Forecast</span>
            <strong>{currency.format(totals.prior)}</strong>
            <small>Previous forecast period</small>
          </div>
          <span className="summary-icon summary-icon-prior" aria-hidden="true">
            ⌁
          </span>
        </article>
        <article className="summary-card summary-card-variance">
          <div>
            <span className="summary-label">Variance</span>
            <strong>
              {totals.variance >= 0 ? '+' : '−'}
              {currency.format(Math.abs(totals.variance))}
            </strong>
            <small>
              {totals.prior
                ? `${((totals.variance / totals.prior) * 100).toFixed(1)}% vs. prior`
                : 'Compared with prior forecast'}
            </small>
          </div>
          <span
            className="summary-icon summary-icon-variance"
            aria-hidden="true"
          >
            %
          </span>
        </article>
      </section>

      <section className="versions-section" aria-labelledby="versions-title">
        {message && (
          <div className="notice template-action-notice">{message}</div>
        )}
        <div className="list-toolbar">
          <div className="list-filters">
            <label className="search-control">
              <span className="visually-hidden">Search templates</span>
              <input
                type="search"
                placeholder="Search Templates..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <span aria-hidden="true">⌕</span>
            </label>
            <label className="status-control">
              <span className="visually-hidden">Filter by status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option>All Status</option>
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="template-toolbar-actions">
            <button
              className={`manager-view-button${managerView ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={managerView}
              onClick={() => setManagerView((current) => !current)}
            >
              {managerView ? 'Manager View On' : 'Manager View'}
            </button>
            <button
              className="upload-template-button"
              onClick={() => setDialog('upload')}
              type="button"
            >
              Upload template
            </button>
            <button
              className="create-template-button"
              onClick={() => setDialog('create')}
              type="button"
            >
              <span aria-hidden="true">＋</span> Create template
            </button>
          </div>
        </div>

        <div className="versions-table-card">
          <div className="table-title-row">
            <h1 id="versions-title">Forecast Versions</h1>
            <span>{filteredItems.length} results</span>
          </div>
          <div className="table-scroll">
            <table className="versions-table">
              <thead>
                <tr>
                  <th scope="col">Template Name</th>
                  <th scope="col">Version</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="numeric-cell">
                    Current Forecast
                  </th>
                  <th scope="col" className="numeric-cell">
                    Prior Forecast
                  </th>
                  <th scope="col" className="numeric-cell">
                    Variance
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((template) => (
                  <tr key={template.templateName}>
                    <td>
                      <Link
                        className="template-link"
                        to={`/templates/${encodeURIComponent(template.templateName)}`}
                      >
                        <span className="row-chevron" aria-hidden="true">
                          ›
                        </span>
                        <span>{template.templateName}</span>
                      </Link>
                    </td>
                    <td>{template.version}</td>
                    <td>
                      <span
                        className={`status-pill status-${String(template.status).toLowerCase()}`}
                      >
                        {template.status}
                      </span>
                    </td>
                    <td className="numeric-cell">
                      {currency.format(template.currentForecast || 0)}
                    </td>
                    <td className="numeric-cell">
                      {currency.format(template.priorForecast || 0)}
                    </td>
                    <td className="numeric-cell variance-cell">
                      {Number(template.variance) >= 0 ? '+' : '−'}
                      {currency.format(
                        Math.abs(Number(template.variance || 0)),
                      )}
                    </td>
                  </tr>
                ))}
                {!filteredItems.length && (
                  <tr>
                    <td className="empty-results" colSpan="6">
                      No forecast versions match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
