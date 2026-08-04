import { ApiError, request } from './client';

// The four auth endpoints (docs/api_design.md, "Auth"). This module owns the one
// piece of real logic in the client's auth story: translating the backend's
// deliberate 401-when-logged-out into a plain `null`.

// --- API shapes (mirrors backend/src/services/auth.service.ts) ---------------

// Every auth response. Note what is NOT here: no id and no avatar. The backend
// never exposes a numeric user id, which is why every client-side ownership
// check compares usernames (post.author.username === user.username) — and why
// those checks are UX only. The real gate is the backend's 403.
export interface PublicUser {
  username: string;
  email: string;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

// Email only — NOT username. docs/screens.md §2 says the login field is "email
// (or username)", but authenticate() looks up `WHERE email = $1`, so the backend
// accepts email alone. One of the two has to change; until it does, this type
// reflects the implementation rather than the doc.
export interface LoginInput {
  email: string;
  password: string;
}

// --- Requests ----------------------------------------------------------------

export function registerUser(input: RegisterInput): Promise<PublicUser> {
  return request<PublicUser>('/auth/register', { method: 'POST', body: input });
}

export function loginUser(input: LoginInput): Promise<PublicUser> {
  return request<PublicUser>('/auth/login', { method: 'POST', body: input });
}

export function logoutUser(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' }); // 204
}

// GET /api/auth/session answers 401 { error: { message: 'Not authenticated' } }
// when there is no session — that is the NORMAL logged-out path, not a failure.
// The backend chose 401 over 200 { user: null } so the client's "am I logged in"
// check and its error handling share one code path; this function is the single
// place that translation happens.
//
// Everything else still throws. A 500 or a proxy 502 must NOT be mistaken for
// "anonymous", or an outage would silently log every user out.
export async function getSession(signal?: AbortSignal): Promise<PublicUser | null> {
  try {
    return await request<PublicUser>('/auth/session', { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
