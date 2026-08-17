import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../src/auth/AuthProvider';
import { routes } from '../../src/routes';
import { postsEmpty, postsError } from '../msw/handlers';
import { server } from '../setup';

// Explore end to end: the real route table, the real api/client.ts, and the real
// useAsync machinery driven against the query-aware MSW posts/categories handlers.
// The default session handler answers 401, so this exercises the anonymous path.
function renderAppAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

// The rendered post titles, in order — each PostCard title is an <h2>.
function cardTitles(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
}

describe('Explore', () => {
  it('lists posts newest-first on the initial load', async () => {
    renderAppAt('/');

    expect(await screen.findByRole('link', { name: 'Alpha' })).toBeInTheDocument();
    // limit 2, newest order Alpha, Bravo, Charlie → page 1 is Alpha, Bravo.
    expect(cardTitles()).toEqual(['Alpha', 'Bravo']);
  });

  it('renders the empty state when nothing matches', async () => {
    server.use(postsEmpty());
    renderAppAt('/');

    expect(await screen.findByText('No posts match your filters.')).toBeInTheDocument();
  });

  it('renders the error state when the list request fails', async () => {
    server.use(postsError());
    renderAppAt('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('filters by category', async () => {
    const user = userEvent.setup();
    renderAppAt('/');
    await screen.findByRole('link', { name: 'Alpha' });

    await user.selectOptions(screen.getByLabelText('Category'), 'tech');

    // Tech posts are Alpha and Charlie; the Life post Bravo drops out.
    expect(await screen.findByRole('link', { name: 'Charlie' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bravo' })).not.toBeInTheDocument();
  });

  it('reorders by most-liked', async () => {
    const user = userEvent.setup();
    renderAppAt('/');
    await screen.findByRole('link', { name: 'Alpha' });

    await user.click(screen.getByRole('button', { name: 'Most liked' }));

    // likeCount order Bravo(5), Charlie(3), Alpha(1) → page 1 is Bravo, Charlie.
    await screen.findByRole('link', { name: 'Charlie' });
    expect(cardTitles()).toEqual(['Bravo', 'Charlie']);
    expect(screen.queryByRole('link', { name: 'Alpha' })).not.toBeInTheDocument();
  });

  it('paginates with Prev/Next', async () => {
    const user = userEvent.setup();
    renderAppAt('/');
    await screen.findByRole('link', { name: 'Alpha' });

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    // Re-query the pager after each navigation: the click re-renders Explore, so a
    // reference captured before it is detached from the live tree.
    await user.click(within(screen.getByRole('navigation', { name: 'Pagination' })).getByRole('button', { name: 'Next ›' }));

    // Page 2 is Charlie; the page-1 posts are gone.
    expect(await screen.findByRole('link', { name: 'Charlie' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Alpha' })).not.toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('searches from the nav bar', async () => {
    const user = userEvent.setup();
    renderAppAt('/');
    await screen.findByRole('link', { name: 'Alpha' });

    await user.type(screen.getByRole('searchbox', { name: 'Search posts' }), 'Charlie{Enter}');

    expect(await screen.findByRole('link', { name: 'Charlie' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Alpha' })).not.toBeInTheDocument();
    // The active-search indicator, with a working clear.
    const note = screen.getByText(/Results for/);
    expect(note).toHaveTextContent('Charlie');
  });
});
