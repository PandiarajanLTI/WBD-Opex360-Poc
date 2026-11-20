import { apiJson, apiRequest } from '../../../services/api/apiClient';

const inFlightRequests = new Map();

function shareInFlightRequest(key, request) {
  const existing = inFlightRequests.get(key);
  if (existing) return existing;

  const pending = Promise.resolve().then(request);
  inFlightRequests.set(key, pending);
  pending.finally(() => {
    if (inFlightRequests.get(key) === pending) inFlightRequests.delete(key);
  }).catch(() => {});
  return pending;
}

export const forecastService = {
  getMetadata: (name) => {
    const url = `/templates/${encodeURIComponent(name)}/metadata`;
    return shareInFlightRequest(`GET:${url}`, () => apiJson(url));
  },
  queryRows: (name, request) => {
    const url = `/templates/${encodeURIComponent(name)}/rows/query`;
    const body = JSON.stringify(request);
    return shareInFlightRequest(`POST:${url}:${body}`, () =>
      apiJson(url, { method: 'POST', body }),
    );
  },
  querySummaryRows: (name, request) => {
    const url = `/templates/${encodeURIComponent(name)}/rows/summary`;
    const body = JSON.stringify(request);
    return shareInFlightRequest(`POST:${url}:${body}`, () =>
      apiJson(url, { method: 'POST', body }),
    );
  },
  validateRows: (name, rows) =>
    apiJson(`/templates/${encodeURIComponent(name)}/rows/validate`, {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),
  saveRows: (name, rows) =>
    apiJson(`/templates/${encodeURIComponent(name)}/rows/save`, {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),
  exportRows: async (name) => {
    const response = await apiRequest(
      `/templates/${encodeURIComponent(name)}/export`,
    );
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name}.csv`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  },
};
