import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import {
  getSession,
  loginUser,
  logoutUser,
  registerUser,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
} from '../api/auth';
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext';

// Owns the app's answer to "who is this?". Mounted in main.tsx *outside* the
// router, not as a route element: the nav, both guards, and every screen need it,
// and it must survive route changes without re-probing the session.
//
// The session cookie is httpOnly, so JS cannot read it. GET /api/auth/session is
// the only way to learn whether we are logged in, which is why that probe is this
// component's entire bootstrap.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    // AbortController rather than a boolean flag: it both ignores the stale
    // result and cancels the request. Under StrictMode the effect runs twice in
    // development, and this is what keeps the first probe from resolving into an
    // unmounted tree.
    const controller = new AbortController();

    getSession(controller.signal)
      .then((sessionUser) => {
        setUser(sessionUser);
        setStatus(sessionUser ? 'authenticated' : 'anonymous');
      })
      .catch((error: unknown) => {
        // getSession already folded 401 into `null`, so anything landing here is
        // a real failure (500, a proxy 502, the API being down). Treat it as
        // anonymous — it is the safe default, since every gated screen re-checks
        // against the server anyway — but do not pretend it was a clean logout.
        if (controller.signal.aborted) return;
        console.error('Session probe failed; treating the visitor as anonymous.', error);
        setUser(null);
        setStatus('anonymous');
      });

    return () => controller.abort();
  }, []);

  // login/register/logout deliberately do NOT catch ApiError. The Login and
  // Register screens need error.status and error.field to render 400/401/409
  // inline against the right input, so the error propagates to the caller.
  const login = useCallback(async (input: LoginInput) => {
    const loggedIn = await loginUser(input);
    setUser(loggedIn);
    setStatus('authenticated');
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const registered = await registerUser(input);
    setUser(registered);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
    setUser(null);
    setStatus('anonymous');
  }, []);

  // Re-probe the session on demand (after an email change). Same 401→null path as
  // the mount probe; a real failure is left to propagate to the caller.
  const refresh = useCallback(async () => {
    const sessionUser = await getSession();
    setUser(sessionUser);
    setStatus(sessionUser ? 'authenticated' : 'anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout, refresh }),
    [status, user, login, register, logout, refresh],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
