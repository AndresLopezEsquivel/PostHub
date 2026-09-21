import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../src/auth/AuthProvider';
import { routes } from '../../src/routes';
import { sessionHandler } from '../msw/handlers';
import { server } from '../setup';

// Create / edit / delete end to end: the real router + PostForm + DeletePostButton +
// client.ts against MSW. Alpha (post 1) is authored by 'andres' in the fixtures.
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

describe('Create / edit / delete post', () => {
  it('creates a post and lands on its detail', async () => {
    authAs('andres');
    // The new post (id 100) must resolve when the create navigation opens its detail.
    server.use(
      http.get('*/api/posts/100', () =>
        HttpResponse.json({
          id: 100,
          title: 'My New Post',
          excerpt: 'Body text.',
          content: 'Body text.',
          imageKey: null,
          updatedAt: null,
          author: { username: 'andres', avatarUrl: null },
          categories: [{ name: 'Tech', slug: 'tech' }],
          likeCount: 0,
          commentCount: 0,
          likedByMe: false,
          bookmarkedByMe: false,
          createdAt: '2026-08-20T00:00:00.000Z',
        }),
      ),
    );
    const user = userEvent.setup();
    renderAppAt('/posts/new');

    await user.type(await screen.findByLabelText('Title'), 'My New Post');
    await user.type(screen.getByLabelText('Body'), 'Body text.');
    await user.click(screen.getByRole('checkbox', { name: 'Tech' }));
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByRole('heading', { name: 'My New Post' })).toBeInTheDocument();
  });

  it('blocks an empty create submit client-side', async () => {
    authAs('andres');
    const user = userEvent.setup();
    renderAppAt('/posts/new');

    await user.click(await screen.findByRole('button', { name: 'Publish' }));

    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Content is required')).toBeInTheDocument();
    // Still on the create screen — nothing navigated.
    expect(screen.getByRole('heading', { name: 'Create post' })).toBeInTheDocument();
  });

  it('prefills the edit form and saves', async () => {
    authAs('andres');
    const user = userEvent.setup();
    renderAppAt('/posts/1/edit');

    const title = await screen.findByLabelText('Title');
    expect(title).toHaveValue('Alpha');
    expect(screen.getByLabelText('Body')).toHaveValue('Full body of Alpha.\nSecond line.');
    expect(screen.getByRole('checkbox', { name: 'Tech' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Life' })).not.toBeChecked();

    await user.clear(title);
    await user.type(title, 'Alpha Edited');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // Navigated to the post's detail (MSW is stateless, so it re-serves 'Alpha').
    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit post' })).not.toBeInTheDocument();
  });

  it('shows a "can\'t edit" state to a non-owner', async () => {
    authAs('someone_else');
    renderAppAt('/posts/1/edit');

    expect(await screen.findByRole('heading', { name: "You can't edit this post" })).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('deletes from the edit screen and lands on Explore', async () => {
    authAs('andres');
    const user = userEvent.setup();
    renderAppAt('/posts/1/edit');

    await screen.findByLabelText('Title');
    await user.click(screen.getByRole('button', { name: 'Delete' })); // reveal confirm
    await user.click(screen.getByRole('button', { name: 'Delete' })); // confirm

    expect(await screen.findByRole('heading', { name: 'Explore' })).toBeInTheDocument();
  });

  it('shows author controls on detail only to the owner', async () => {
    authAs('andres');
    renderAppAt('/posts/1');

    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/posts/1/edit',
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('hides author controls on detail from anonymous visitors', async () => {
    renderAppAt('/posts/1');

    await screen.findByRole('heading', { name: 'Alpha' });
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});
