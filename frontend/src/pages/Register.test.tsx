import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/client';
import { Register } from './Register';

// Unit scope: the page's own logic — client validation gating the request, and
// the ApiError.field -> field-error mapping. useAuth is mocked; the real network
// path and the post-success redirect (owned by AnonymousOnly) are the integration
// test's job.

const registerMock = vi.fn();

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ register: registerMock }),
}));

function renderRegister() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  );
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Username'), 'andres');
  await user.type(screen.getByLabelText('Email'), 'andres@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.type(screen.getByLabelText('Confirm password'), 'password123');
}

describe('Register', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('blocks an empty submit client-side and fires no request', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Username is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('rejects a too-short username, a bad email, and a mismatched confirm without a request', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Username'), 'ab');
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password124');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Username must be between 3 and 30 characters')).toBeInTheDocument();
    expect(screen.getByText('A valid email is required')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('maps a 409 to the username field', async () => {
    registerMock.mockRejectedValueOnce(new ApiError(409, 'Username already taken', 'username'));
    const user = userEvent.setup();
    renderRegister();

    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Username already taken')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
  });

  it('submits trimmed values to register on a valid form', async () => {
    registerMock.mockResolvedValueOnce({ username: 'andres', email: 'andres@example.com' });
    const user = userEvent.setup();
    renderRegister();

    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(registerMock).toHaveBeenCalledExactlyOnceWith({
      username: 'andres',
      email: 'andres@example.com',
      password: 'password123',
    });
  });
});
