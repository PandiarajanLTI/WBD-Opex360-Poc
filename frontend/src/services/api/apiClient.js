const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';
export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => ({}))).detail ?? 'Request failed',
    );
  return response;
}
export async function apiJson(path, options) {
  return (await apiRequest(path, options)).json();
}
