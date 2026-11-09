const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';
export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(getErrorMessage(errorBody, response.status));
  }
  return response;
}
export async function apiJson(path, options) {
  return (await apiRequest(path, options)).json();
}

function getErrorMessage(errorBody, status) {
  const detail = errorBody?.detail;

  // FastAPI business/validation errors:
  // { detail: [{ rowId: -1, message: "..." }] }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item?.message) {
          return item.message;
        }

        // Standard FastAPI/Pydantic validation errors
        if (item?.msg) {
          const field = Array.isArray(item.loc)
            ? item.loc.filter((part) => part !== 'body').join(' > ')
            : '';

          return field ? `${field}: ${item.msg}` : item.msg;
        }

        return null;
      })
      .filter(Boolean);

    if (messages.length) {
      return messages.join('\n');
    }
  }

  // { detail: "Some error" }
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  // { message: "Some error" }
  if (
    typeof errorBody?.message === 'string' &&
    errorBody.message.trim()
  ) {
    return errorBody.message;
  }

  if (status === 400) {
    return 'The request contains invalid data.';
  }

  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }

  if (status === 403) {
    return 'You do not have permission to perform this action.';
  }

  if (status === 404) {
    return 'The requested information could not be found.';
  }

  if (status === 409) {
    return 'The requested change conflicts with existing data.';
  }

  if (status === 422) {
    return 'Some of the entered values are invalid. Please review them and try again.';
  }

  if (status >= 500) {
    return 'Something went wrong while processing the request. Please try again.';
  }

  return 'The request could not be completed. Please try again.';
}
