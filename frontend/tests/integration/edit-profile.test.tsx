import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../src/auth/AuthProvider';
import { routes } from '../../src/routes';
import { emailTaken, sessionHandler } from '../msw/handlers';
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

describe('Edit profile', () => {
  it('prefills bio and email, offers no username field', async () => {
    authAs('andres');
    renderAppAt('/settings/profile');

    expect(await screen.findByLabelText('Bio')).toHaveValue('Bio of andres');
    expect(screen.getByLabelText('Email')).toHaveValue('andres@example.com');
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
  });

  it('saves a bio change and returns to the profile', async () => {
    authAs('andres');
    const user = userEvent.setup();
    renderAppAt('/settings/profile');

    const bio = await screen.findByLabelText('Bio');
    await user.clear(bio);
    await user.type(bio, 'A new bio');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Navigated to the user's own profile.
    expect(await screen.findByRole('heading', { name: 'andres' })).toBeInTheDocument();
  });

  it('maps an email conflict to the email field', async () => {
    authAs('andres');
    server.use(emailTaken());
    const user = userEvent.setup();
    renderAppAt('/settings/profile');

    const email = await screen.findByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'taken@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Email already registered')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit profile' })).toBeInTheDocument();
  });

  it('catches a password/confirm mismatch client-side', async () => {
    authAs('andres');
    const user = userEvent.setup();
    renderAppAt('/settings/profile');

    await user.type(await screen.findByLabelText('New password'), 'password123');
    await user.type(screen.getByLabelText('Confirm new password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    // Still on the edit screen — nothing was submitted.
    expect(screen.getByRole('heading', { name: 'Edit profile' })).toBeInTheDocument();
  });
});
