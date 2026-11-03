import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from './useAuth';

// For Login and Register: a visitor who is already logged in is sent on.
//
// This guard does the redirect after login or registration. The forms don't
// navigate: on success the auth status changes, and this guard re-renders and
// redirects. If the forms navigated too, the two redirects would race.
interface LocationState {
  from?: { pathname?: string };
}

export function AnonymousOnly() {
  const { status } = useAuth();
  const location = useLocation();

  // Wait for the session check instead of guessing: guessing 'anonymous' would
  // show the login form to someone already logged in.
  if (status === 'loading') {
    return <p role="status">Loading…</p>;
  }

  if (status === 'authenticated') {
    // Go back to the page RequireAuth saved in state.from, or to '/' (Explore).
    // Not back through history, which could land on the login page again.
    const from = (location.state as LocationState | null)?.from?.pathname ?? '/';
    return <Navigate to={from} replace />;
  }

  return <Outlet />;
}
