import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson } from '../../../services/api/apiClient';
export default function LandingPage() {
  const [state, setState] = useState({ items: [], isLoading: true, error: '' });
  useEffect(() => {
    apiJson('/templates')
      .then((items) => setState({ items, isLoading: false, error: '' }))
      .catch((error) =>
        setState({ items: [], isLoading: false, error: error.message }),
      );
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Forecast templates</h1>
          <p>Choose a working template to review and update.</p>
        </div>
      </div>
      {state.isLoading ? (
        <div className="panel">Loading…</div>
      ) : state.error ? (
        <div className="error">{state.error}</div>
      ) : (
        <div className="card-grid">
          {state.items.map((template) => (
            <Link
              className="template-card"
              key={template.templateName}
              to={`/templates/${encodeURIComponent(template.templateName)}`}
            >
              <span className="badge">{template.status}</span>
              <h2>{template.templateName}</h2>
              <p>
                {template.section} • {template.version}
              </p>
              <strong>{template.currentForecast.toLocaleString()}</strong>
              <small>Variance {template.variance.toLocaleString()}</small>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
