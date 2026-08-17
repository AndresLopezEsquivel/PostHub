import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../src/auth/AuthProvider';
import { routes } from '../../src/routes';
import { sessionHandler } from '../msw/handlers';
import { server } from '../setup';

// Post detail end to end: the real router + api/client.ts + useAsync + CommentThread
// against MSW. The default session handler answers 401 (anonymous); tests that need
// a logged-in viewer install sessionHandler({ username: 'andres', … }).
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

describe('Post detail', () => {
  it('renders the post with body and author', async () => {
    renderAppAt('/posts/1');

    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByText(/Full body of Alpha\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'andres' })).toHaveAttribute('href', '/users/andres');
  });

  it('shows an in-screen "Post not found" for a missing post, not the NotFound route', async () => {
    renderAppAt('/posts/999999');

    expect(await screen.findByRole('heading', { name: 'Post not found' })).toBeInTheDocument();
    // Still inside the layout — the nav is present.
    expect(screen.getByRole('link', { name: 'PostHub' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
  });

  it('lists comments oldest-first and gates compose behind auth for anonymous', async () => {
    renderAppAt('/posts/1');

    expect(await screen.findByText('First comment')).toBeInTheDocument();
    expect(screen.getByText('My own comment')).toBeInTheDocument();
    // Anonymous: a login prompt inside the thread (scoped — the nav also has a
    // "Log in" link), and no textarea.
    const thread = screen.getByRole('region', { name: 'Comments' });
    expect(within(thread).getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('lets an authenticated user post a comment, which appears and bumps the count', async () => {
    authenticated();
    const user = userEvent.setup();
    renderAppAt('/posts/1');

    const box = await screen.findByRole('textbox', { name: 'Add a comment' });
    // Wait for the comment fetch to settle (the count starts at 0 before it lands).
    expect(await screen.findByRole('heading', { name: 'Comments (3)' })).toBeInTheDocument();

    await user.type(box, 'A brand new comment');
    await user.click(screen.getByRole('button', { name: 'Post comment' }));

    expect(await screen.findByText('A brand new comment')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Comments (4)' })).toBeInTheDocument();
  });

  it('shows Delete only on the viewer’s own comments and removes on click', async () => {
    authenticated();
    const user = userEvent.setup();
    renderAppAt('/posts/1');

    await screen.findByText('My own comment');
    // Page 1 is [bianca, andres]; only andres's comment is deletable.
    const deletes = screen.getAllByRole('button', { name: 'Delete' });
    expect(deletes).toHaveLength(1);

    await user.click(deletes[0]);

    await screen.findByRole('heading', { name: 'Comments (2)' });
    expect(screen.queryByText('My own comment')).not.toBeInTheDocument();
    expect(screen.getByText('First comment')).toBeInTheDocument();
  });

  it('appends the next page with Load more', async () => {
    renderAppAt('/posts/1');

    const more = await screen.findByRole('button', { name: 'Load more (1 remaining)' });
    expect(screen.queryByText('Third comment')).not.toBeInTheDocument();

    await userEvent.setup().click(more);

    expect(await screen.findByText('Third comment')).toBeInTheDocument();
  });
});
