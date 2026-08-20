import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext';
import { RequireAuth } from './RequireAuth';

// The guard is pure state → decision, so the context is stubbed directly rather
// than driven through AuthProvider and the network. What matters is the three-way
// branch, and especially that 'loading' does not redirect.

function renderGuardedAt(status: AuthStatus, initialPath = '/bookmarks') {
  const value: AuthContextValue = {
    status,
    user: status === 'authenticated' ? { username: 'andres', email: 'a@example.com' } : null,
    login: async () => {},
    register: async () => {},
    logout: async () => {},
    refresh: async () => {},
  };

  const router = createMemoryRouter(
    [
      {
        element: <RequireAuth />,
        children: [{ path: '/bookmarks', element: <p>Bookmarks screen</p> }],
      },
      { path: '/login', element: <p>Login screen</p> },
    ],
    { initialEntries: [initialPath] },
  );

  render(
    <AuthContext value={value}>
      <RouterProvider router={router} />
    </AuthContext>,
  );
}

describe('RequireAuth', () => {
  it('holds instead of redirecting while the session probe is in flight', () => {
    // The load-bearing case. Redirecting here would bounce every authenticated
    // user off their own deep link on a hard refresh, before we know who they are.
    renderGuardedAt('loading');

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument();
    expect(screen.queryByText('Bookmarks screen')).not.toBeInTheDocument();
  });

  it('redirects an anonymous visitor to /login', () => {
    renderGuardedAt('anonymous');

    expect(screen.getByText('Login screen')).toBeInTheDocument();
    expect(screen.queryByText('Bookmarks screen')).not.toBeInTheDocument();
  });

  it('renders the guarded screen for an authenticated visitor', () => {
    renderGuardedAt('authenticated');

    expect(screen.getByText('Bookmarks screen')).toBeInTheDocument();
  });
});
