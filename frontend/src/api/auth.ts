import { ApiError, request } from './client';

// Same shape as PublicUser in backend/src/services/auth.service.ts. There's
// no user id, so client-side ownership checks compare usernames. Those checks
// only change the UI; the backend's 403 is the real check.
export interface PublicUser {
  username: string;
  email: string;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

// Email only, not username: the backend looks users up by email.
export interface LoginInput {
  email: string;
  password: string;
}

export function registerUser(input: RegisterInput): Promise<PublicUser> {
  return request<PublicUser>('/auth/register', { method: 'POST', body: input });
}

export function loginUser(input: LoginInput): Promise<PublicUser> {
  return request<PublicUser>('/auth/login', { method: 'POST', body: input });
}

export function logoutUser(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' });
}

// GET /api/auth/session returns 401 when nobody is logged in. That's the
// normal logged-out case, so it becomes null here. Any other error is
// rethrown: treating a 500 or a proxy 502 as logged out would sign every
// user out during an outage.
export async function getSession(signal?: AbortSignal): Promise<PublicUser | null> {
  try {
    return await request<PublicUser>('/auth/session', { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
