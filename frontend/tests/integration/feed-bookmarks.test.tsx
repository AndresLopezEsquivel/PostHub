import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../src/auth/AuthProvider';
import { routes } from '../../src/routes';
import { bookmarksEmpty, feedEmpty, sessionHandler } from '../msw/handlers';
import { server } from '../setup';

// Feed and Bookmarks — both are just a PostCardList over a different source, so the
// pass's real behaviour is the CTA empty state and the remove-on-unbookmark path.
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

describe('Feed & Bookmarks', () => {
  it('renders the feed', async () => {
    authenticated();
    renderAppAt('/feed');

    expect(await screen.findByRole('link', { name: 'Alpha' })).toBeInTheDocument();
  });

  it('shows a call-to-action when the feed is empty', async () => {
    authenticated();
    server.use(feedEmpty());
    renderAppAt('/feed');

    expect(await screen.findByText(/Follow people to see their posts/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'explore posts' })).toHaveAttribute('href', '/');
  });

  it('renders bookmarks', async () => {
    authenticated();
    renderAppAt('/bookmarks');

    expect(await screen.findByRole('link', { name: 'Alpha' })).toBeInTheDocument();
  });

  it('removes a card as soon as it is unbookmarked', async () => {
    authenticated();
    const user = userEvent.setup();
    renderAppAt('/bookmarks');

    const alpha = await screen.findByRole('link', { name: 'Alpha' });
    const card = alpha.closest('article') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Bookmark' }));

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Alpha' })).not.toBeInTheDocument(),
    );
    // The others stay.
    expect(screen.getByRole('link', { name: 'Bravo' })).toBeInTheDocument();
  });

  it('shows a message when there are no bookmarks', async () => {
    authenticated();
    server.use(bookmarksEmpty());
    renderAppAt('/bookmarks');

    expect(
      await screen.findByText("You haven't bookmarked any posts yet."),
    ).toBeInTheDocument();
  });
});
