import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../src/auth/AuthProvider';
import { routes } from '../../src/routes';
import { sessionHandler, userNotFound } from '../msw/handlers';
import { server } from '../setup';

function renderAppAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

function authAs(username: string) {
  server.use(sessionHandler({ username, email: `${username}@example.com` }));
}

describe('Profile & follows', () => {
  it('shows another user with a Follow button, not an Edit link', async () => {
    authAs('andres');
    renderAppAt('/users/bianca');

    expect(await screen.findByRole('heading', { name: 'bianca' })).toBeInTheDocument();
    expect(screen.getByText('Bio of bianca')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument();
  });

  it('shows your own profile with an Edit link, not a Follow button', async () => {
    authAs('andres');
    renderAppAt('/users/andres');

    expect(await screen.findByRole('heading', { name: 'andres' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute(
      'href',
      '/settings/profile',
    );
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
  });

  it('follows optimistically and bumps the follower count', async () => {
    authAs('andres');
    const user = userEvent.setup();
    renderAppAt('/users/bianca');

    await screen.findByRole('heading', { name: 'bianca' });
    expect(screen.getByRole('link', { name: '10 followers' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Follow' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(screen.getByRole('link', { name: '11 followers' })).toBeInTheDocument();
  });

  it('renders a followers list, toggles a row, and switches tabs', async () => {
    authAs('andres');
    const user = userEvent.setup();
    renderAppAt('/users/bianca/followers');

    // carol is not followed, dave is — scope to carol's row (dave's button is
    // already pressed, so a page-wide pressed query would be ambiguous).
    await screen.findByRole('link', { name: 'carol' });
    const carolRow = screen.getByRole('link', { name: 'carol' }).closest('li') as HTMLElement;
    const carolFollow = within(carolRow).getByRole('button', { name: 'Follow' });
    expect(carolFollow).toHaveAttribute('aria-pressed', 'false');

    await user.click(carolFollow);
    await waitFor(() => expect(carolFollow).toHaveAttribute('aria-pressed', 'true'));

    await user.click(screen.getByRole('link', { name: 'Following' }));
    expect(await screen.findByRole('link', { name: 'carol' })).toBeInTheDocument();
  });

  it('sends an anonymous visitor to login when they try to follow', async () => {
    const user = userEvent.setup();
    renderAppAt('/users/bianca');

    await screen.findByRole('heading', { name: 'bianca' });
    await user.click(screen.getByRole('button', { name: 'Follow' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('shows "User not found" for a missing user', async () => {
    server.use(userNotFound());
    renderAppAt('/users/nobody');

    expect(await screen.findByRole('heading', { name: 'User not found' })).toBeInTheDocument();
  });
});
