import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from './useAuth';

// A layout route rather than a wrapper per element, so the redirect rule is
// written once for every guarded route.
//
// This only shapes the UI. The backend's 401 and 403 are the real check.
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  // Don't redirect while the session check is running: a logged-in user
  // reloading a deep link would be sent away.
  if (status === 'loading') {
    return <p role="status">Loading…</p>;
  }

  if (status === 'anonymous') {
    // `state.from` lets the Login screen send the user back where they were
    // aiming. `replace` keeps the guarded URL out of history, so Back does not
    // re-trigger the redirect.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
