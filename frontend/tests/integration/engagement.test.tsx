import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../src/auth/AuthProvider';
import { routes } from '../../src/routes';
import { likeError, sessionHandler } from '../msw/handlers';
import { server } from '../setup';

// Like/bookmark end to end on Explore: real card + EngagementBar + usePostToggles +
// client.ts against MSW. The first rendered card is Alpha (newest), likeCount 1.
function renderAppAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

function authenticated() {
  server.use(sessionHandler({ username: 'andres', email: 'andres@example.com' }));
}

// The first card's like/bookmark buttons (Alpha).
const firstLike = () => screen.getAllByRole('button', { name: 'Like' })[0];
const firstBookmark = () => screen.getAllByRole('button', { name: 'Bookmark' })[0];

describe('engagement', () => {
  it('optimistically toggles a like and reconciles with the server count', async () => {
    authenticated();
    const user = userEvent.setup();
    renderAppAt('/');

    await screen.findByRole('link', { name: 'Alpha' });
    expect(firstLike()).toHaveTextContent('1');
    expect(firstLike()).toHaveAttribute('aria-pressed', 'false');

    await user.click(firstLike());
    await waitFor(() => expect(firstLike()).toHaveAttribute('aria-pressed', 'true'));
    expect(firstLike()).toHaveTextContent('2');

    await user.click(firstLike());
    await waitFor(() => expect(firstLike()).toHaveAttribute('aria-pressed', 'false'));
    expect(firstLike()).toHaveTextContent('1');
  });

  it('toggles a bookmark', async () => {
    authenticated();
    const user = userEvent.setup();
    renderAppAt('/');

    await screen.findByRole('link', { name: 'Alpha' });
    expect(firstBookmark()).toHaveAttribute('aria-pressed', 'false');

    await user.click(firstBookmark());
    await waitFor(() => expect(firstBookmark()).toHaveAttribute('aria-pressed', 'true'));
    expect(firstBookmark()).toHaveTextContent('Bookmarked');
  });

  it('rolls the like back when the request fails', async () => {
    authenticated();
    server.use(likeError());
    const user = userEvent.setup();
    renderAppAt('/');

    await screen.findByRole('link', { name: 'Alpha' });
    await user.click(firstLike());

    // Optimistic bump then rollback to the original count/state.
    await waitFor(() => expect(firstLike()).toHaveAttribute('aria-pressed', 'false'));
    expect(firstLike()).toHaveTextContent('1');
  });

  it('sends an anonymous visitor to login on click', async () => {
    // Default session handler is 401 → anonymous.
    const user = userEvent.setup();
    renderAppAt('/');

    await screen.findByRole('link', { name: 'Alpha' });
    await user.click(firstLike());

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});
