import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../src/auth/AuthProvider';
import { routes } from '../../src/routes';
import { loginInvalid, registerConflict } from '../msw/handlers';
import { server } from '../setup';

// Uses the real route table, AuthProvider and api/client.ts against MSW, with
// nothing mocked above the network. A passing test means the whole chain
// holds: form, client, ApiError, field or form error, and on success the
// session, nav and redirect.
function renderAppAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

describe('auth flows', () => {
  it('registers, flips the nav to authenticated, and lands on Explore', async () => {
    const user = userEvent.setup();
    renderAppAt('/register');

    await user.type(await screen.findByLabelText('Username'), 'newbie');
    await user.type(screen.getByLabelText('Email'), 'newbie@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    // Navigated to '/' (Explore) with the authenticated nav.
    expect(await screen.findByRole('heading', { name: 'Explore' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Feed' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'newbie' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Register' })).not.toBeInTheDocument();
  });

  it('surfaces a taken username against the field, without leaving the form', async () => {
    server.use(registerConflict('username', 'Username already taken'));
    const user = userEvent.setup();
    renderAppAt('/register');

    await user.type(await screen.findByLabelText('Username'), 'andres');
    await user.type(screen.getByLabelText('Email'), 'andres@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Username already taken')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Register' })).toBeInTheDocument();
  });

  it('logs in from a guarded screen and returns to it', async () => {
    const user = userEvent.setup();
    // Anonymous visit to a guarded screen: RequireAuth bounces to /login with
    // state.from = /bookmarks.
    renderAppAt('/bookmarks');

    await user.type(await screen.findByLabelText('Email'), 'andres@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    // Back on the screen we were bounced from, now authenticated.
    expect(await screen.findByRole('heading', { name: 'Bookmarks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Feed' })).toBeInTheDocument();
  });

  it('shows a wrong-credentials 401 as a form-level error', async () => {
    server.use(loginInvalid());
    const user = userEvent.setup();
    renderAppAt('/login');

    await user.type(await screen.findByLabelText('Email'), 'andres@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});
