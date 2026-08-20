import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/client';
import { Login } from './Login';

const loginMock = vi.fn();

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ login: loginMock }),
}));

// Unit scope: the form's own logic. The post-success redirect is owned by
// AnonymousOnly, not this component, so it is exercised in the integration test.
function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Login />
    </MemoryRouter>,
  );
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'andres@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');
}

describe('Login', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a 401 as a form-level error, not against a field', async () => {
    loginMock.mockRejectedValueOnce(new ApiError(401, 'Invalid credentials'));
    const user = userEvent.setup();
    renderLogin();

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  });

  it('submits trimmed credentials to login on a valid form', async () => {
    loginMock.mockResolvedValueOnce({ username: 'andres', email: 'andres@example.com' });
    const user = userEvent.setup();
    renderLogin();

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(loginMock).toHaveBeenCalledExactlyOnceWith({
      email: 'andres@example.com',
      password: 'password123',
    });
  });

  it('blocks an empty submit client-side', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });
});
