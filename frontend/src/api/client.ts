// The one place this app touches the network. Every screen goes through a
// resource module (api/auth.ts, api/posts.ts, …) and every resource module goes
// through request<T>() — so there is exactly one implementation of "how a PostHub
// request is made" and exactly one shape for "how it failed".
//
// Deliberately absent: any base URL, host, or port. docs/api_design.md fixes the
// base path at /api and the browser only ever addresses the frontend origin —
// Vite proxies /api in dev, nginx does in production. A VITE_API_URL would make
// every request cross-origin, which breaks the session cookie outright, since the
// backend mounts no CORS middleware on purpose.
//
// Also deliberately absent: caching, retries, and request deduplication. Screens
// own their own loading state for now. If that stops scaling, that is the moment
// to justify a data-fetching library — not before.

const BASE = '/api';

export interface ApiErrorBody {
  error: { message: string; field?: string };
}

// Every list endpoint returns this envelope (docs/api_design.md, "Pagination").
// Flat by design: no hasMore, no totalPages — the client derives those from
// page/limit/total. GET /api/notifications adds a top-level unreadCount, which
// that module extends rather than this one absorbing.
export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

// The client-side twin of backend/src/errors/httpError.ts. One class carries
// status, message, and the optional `field`, so a caller can branch on the status
// (401 → logged out, 403 → not yours, 404 → gone, 409 → taken) and a form can
// attach the message to the input named by `field`.
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
  // Optional query params. Undefined entries are dropped, so callers can forward
  // optional filters straight through without building strings by hand or
  // emitting `?category=undefined`.
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
    // Same-origin by construction, but stated explicitly: posthub.sid is the only
    // credential this app has, it is httpOnly (unreadable from JS), and every
    // authenticated request depends on the browser attaching it.
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

  // A 204 from a DELETE or a no-op idempotent PUT has nothing to parse. Callers
  // type those as request<void>.
  return payload as T;
}
