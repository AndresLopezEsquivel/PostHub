// No base URL: the browser only talks to its own origin, and Vite (dev) or
// nginx (production) proxies /api to the backend. A separate API origin
// would make every request cross-origin, which the backend doesn't allow
// (it has no CORS middleware).

const BASE = '/api';

export interface ApiErrorBody {
  error: { message: string; field?: string };
}

// The envelope of the paginated list endpoints. The client works out page
// counts from page, limit and total.
export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

// Mirrors the backend's HttpError. `field` names the input a form should
// show the message next to.
export class ApiError extends Error {
  readonly status: number;
  readonly field?: string;

  constructor(status: number, message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.field = field;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  // Undefined entries are dropped, so callers can pass optional filters
  // through as they are.
  query?: Record<string, string | number | boolean | undefined>;
}

function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }

  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

// A failing response is not guaranteed to be ours: nginx answers a 502 with HTML,
// and a proxy timeout has no body at all. Parse defensively so a transport
// failure still surfaces as an ApiError rather than a SyntaxError thrown from
// somewhere unrelated.
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, query } = options;

  const response = await fetch(BASE + path + buildQuery(query), {
    method,
    signal,
    // Same-origin is already the default. It's set explicitly because every
    // authenticated request depends on the browser sending the httpOnly
    // session cookie.
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    const envelope = payload as Partial<ApiErrorBody> | undefined;
    throw new ApiError(
      response.status,
      envelope?.error?.message ?? `Request failed (${response.status})`,
      envelope?.error?.field,
    );
  }

  // A 204 (a DELETE or logout) has no body. Callers type those as request<void>.
  return payload as T;
}
