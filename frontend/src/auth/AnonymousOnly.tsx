import { Navigate, Outlet } from 'react-router';

import { useAuth } from './useAuth';

// The mirror image of RequireAuth, for the two screens docs/screens.md marks
// "Anonymous users only": Register (§1) and Login (§2). An already-authenticated
// visitor landing on /login has nothing to do there.
//
// Sends them to '/' (Explore) rather than back through history, which could
// bounce them straight into the login page again.
export function AnonymousOnly() {
  const { status } = useAuth();

  // Same reasoning as RequireAuth: hold while the probe is in flight rather than
  // guessing. Guessing "anonymous" would flash the login form at someone who is
  // already signed in.
  if (status === 'loading') {
    return <p role="status">Loading…</p>;
  }

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
