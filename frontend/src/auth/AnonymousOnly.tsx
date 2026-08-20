import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from './useAuth';

// The mirror image of RequireAuth, for the two screens docs/screens.md marks
// "Anonymous users only": Register (§1) and Login (§2). An already-authenticated
// visitor landing on /login has nothing to do there.
//
// This guard OWNS the post-authentication redirect, and it is the only thing that
// should — the same single-owner reasoning as RequireAuth owning its bounce. When
// Login/Register succeed they flip the session to 'authenticated' and this guard,
// which wraps them, re-renders and redirects. The forms themselves never navigate:
// if they also called navigate(), that imperative call and this <Navigate /> would
// race on every login, and this one (running in a commit effect after the auth
// flip) would win anyway.
interface LocationState {
  from?: { pathname?: string };
}

export function AnonymousOnly() {
  const { status } = useAuth();
  const location = useLocation();

  // Same reasoning as RequireAuth: hold while the probe is in flight rather than
  // guessing. Guessing "anonymous" would flash the login form at someone who is
  // already signed in.
  if (status === 'loading') {
    return <p role="status">Loading…</p>;
  }

  if (status === 'authenticated') {
    // Honour the destination RequireAuth stashed in state.from when it bounced an
    // anonymous visitor here, so logging in returns them to where they were
    // aiming. Falls back to '/' (Explore) — never back through history, which
    // could bounce them straight into the login page again.
    const from = (location.state as LocationState | null)?.from?.pathname ?? '/';
    return <Navigate to={from} replace />;
  }

  return <Outlet />;
}
