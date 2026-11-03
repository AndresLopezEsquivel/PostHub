import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../src/auth/AuthProvider';
import { routes } from '../../src/routes';
import { sessionHandler } from '../msw/handlers';
import { server } from '../setup';

// One smoke test over the real shell: the route table from src/routes.tsx and
// the real AuthProvider checking GET /api/auth/session through the real
// client, answered by MSW. It covers the wiring, so the route table needs no
// separate test.
//
// createMemoryRouter over routes, not the exported router: the browser router
// uses real history, which would carry one test's navigation into the next,
// and a memory router can start at any path.
function renderAppAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

describe('application shell', () => {
  it('shows the anonymous nav and Explore at the root', async () => {
    // The default handler returns 401: logged out.
    renderAppAt('/');

    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Explore' })).toBeInTheDocument();

    // The authenticated-only links must not be rendered for an anonymous visitor.
    expect(screen.queryByRole('link', { name: 'Feed' })).not.toBeInTheDocument();
  });

  it('redirects an anonymous visitor away from a guarded screen', async () => {
    renderAppAt('/bookmarks');

    // RequireAuth sends them to /login, where AnonymousOnly lets them through.
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bookmarks' })).not.toBeInTheDocument();
  });

  it('shows the authenticated nav and renders a guarded screen once the session resolves', async () => {
    server.use(sessionHandler({ username: 'andres', email: 'andres@example.com' }));

    renderAppAt('/bookmarks');

    // The guarded screen renders instead of redirecting, because RequireAuth
    // waits through 'loading'.
    expect(await screen.findByRole('heading', { name: 'Bookmarks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Feed' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'andres' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('renders Not Found inside the layout for an unknown path', async () => {
    renderAppAt('/no-such-screen');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    // Inside the layout: the nav is still there, so the rest of the app stays usable.
    expect(screen.getByRole('link', { name: 'PostHub' })).toBeInTheDocument();
  });
});
