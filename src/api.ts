export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Shared helper for calling the backend JSON API.
 *
 * Centralises the request construction that was previously duplicated across
 * every call site: setting the method, attaching the JSON content-type header,
 * and serialising the request body. When no body is provided (e.g. GET requests
 * or bodyless POSTs) no headers are sent, matching the prior behaviour.
 *
 * Callers keep handling the returned `Response` (status checks, `response.json()`)
 * so error-handling remains local to each feature.
 */
export function apiSend(path: string, method: HttpMethod = 'GET', body?: unknown): Promise<Response> {
  const init: RequestInit = { method };

  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  return fetch(path, init);
}
