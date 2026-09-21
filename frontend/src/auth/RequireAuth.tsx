import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from './useAuth';

// The gate on every "Authenticated users only" screen in docs/screens.md (Feed,
// Create post, Edit post, Edit profile, Notifications, Bookmarks).
//
// Used as a LAYOUT ROUTE, not a per-element wrapper: one instance renders an
// <Outlet /> for its whole subtree, so the redirect rule is written once and
// cannot drift between routes. The same reasoning as backend/src/routes/index.ts
// mounting requireAuth on a router rather than repeating it per handler.
//
// This is UX, never security. The browser can lie about anything here; the real
// gate is the backend's 401/403 on every request.
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  // Hold — do NOT redirect. The session probe is still in flight and we do not
  // yet know the answer. Redirecting here would bounce every authenticated user
  // off their own deep link on a hard refresh.
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
