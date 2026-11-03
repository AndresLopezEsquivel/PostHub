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

// The session cookie is httpOnly, so JS can't read it. GET /api/auth/session
// is the only way to know who is logged in.
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
        // getSession already turned a 401 into null, so this is a real failure (a
        // 500, a proxy 502, the API down). Anonymous is the safe default, since the
        // server checks every gated request, but the error is still logged.
        if (controller.signal.aborted) return;
        console.error('Session probe failed; treating the visitor as anonymous.', error);
        setUser(null);
        setStatus('anonymous');
      });

    return () => controller.abort();
  }, []);

  // login, register and logout don't catch ApiError: the Login and Register
  // screens need its status and field to show the error next to the right input.
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

  // Used after an email change. A 401 becomes null as on mount; any other error
  // goes to the caller.
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
