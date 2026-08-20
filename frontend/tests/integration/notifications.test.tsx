import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../src/auth/AuthProvider';
import { UnreadProvider } from '../../src/notifications/UnreadProvider';
import { routes } from '../../src/routes';
import { notificationsEmpty, sessionHandler } from '../msw/handlers';
import { server } from '../setup';

// Rendered WITH UnreadProvider (as main.tsx does) so the nav badge is live. The
// default notifications handler has two unread of three.
function renderAppAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <UnreadProvider>
        <RouterProvider router={router} />
      </UnreadProvider>
    </AuthProvider>,
  );
}

function authenticated() {
  server.use(sessionHandler({ username: 'andres', email: 'andres@example.com' }));
}

describe('Notifications', () => {
  it('renders like/comment/follow rows linking to their sources', async () => {
    authenticated();
    renderAppAt('/notifications');

    const carol = await screen.findByText('carol');
    expect(carol.closest('a')).toHaveAttribute('href', '/posts/1'); // like → post
    expect(screen.getByText(/liked your post/)).toBeInTheDocument();

    expect(screen.getByText('dave').closest('a')).toHaveAttribute('href', '/posts/2'); // comment
    expect(screen.getByText('erin').closest('a')).toHaveAttribute('href', '/users/erin'); // follow
  });

  it('shows the unread count on the nav badge', async () => {
    authenticated();
    renderAppAt('/notifications');

    expect(await screen.findByLabelText('2 unread')).toBeInTheDocument();
  });

  it('marks a notification read on open, dropping the badge by one', async () => {
    authenticated();
    const user = userEvent.setup();
    renderAppAt('/notifications');

    // Wait for both independent requests: the list (carol) and the badge. They race,
    // so relying on the badge alone can click before the list renders.
    await screen.findByText('carol');
    await screen.findByLabelText('2 unread');
    await user.click(screen.getByText('carol')); // the like → /posts/1

    // Navigated to the post, and the badge dropped to 1.
    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByLabelText('1 unread')).toBeInTheDocument();
  });

  it('clears the badge with Mark all read', async () => {
    authenticated();
    const user = userEvent.setup();
    renderAppAt('/notifications');

    await screen.findByLabelText('2 unread');
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));

    await waitFor(() => expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  });

  it('shows an empty state', async () => {
    authenticated();
    server.use(notificationsEmpty());
    renderAppAt('/notifications');

    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
  });
});
