const API_BASE = import.meta.env.PROD
  ? 'https://debora-unstandard-feyly.ngrok-free.dev'
  : 'http://localhost:5000';

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, data: any) => apiRequest<T>(path, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  put: <T>(path: string, data: any) => apiRequest<T>(path, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: <T>(path: string) => apiRequest<T>(path, {
    method: 'DELETE',
  }),
};
