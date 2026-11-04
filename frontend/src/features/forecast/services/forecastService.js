import { apiJson, apiRequest } from '../../../services/api/apiClient';
export const forecastService = {
  getMetadata: (name, signal) =>
    apiJson(`/templates/${encodeURIComponent(name)}/metadata`, { signal }),
  queryRows: (name, request, signal) =>
    apiJson(`/templates/${encodeURIComponent(name)}/rows/query`, {
      method: 'POST',
      body: JSON.stringify(request),
      signal,
    }),
  querySummaryRows: (name, request, signal) =>
    apiJson(`/templates/${encodeURIComponent(name)}/rows/summary`, {
      method: 'POST',
      body: JSON.stringify(request),
      signal,
    }),
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
