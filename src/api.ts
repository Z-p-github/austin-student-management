export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, body?: object): Promise<T> {
  const response = await fetch('/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => null);
  if (!response.ok || result === null) {
    throw new ApiError(result?.error || 'Could not reach Student Desk. Try again.', response.status);
  }
  return result as T;
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status === 401 && error.message === 'Please sign in.'
      ? 'Your session has ended. Refresh and sign in again.'
      : error.message;
  }
  return 'Could not reach Student Desk. Check your connection and try again.';
}
