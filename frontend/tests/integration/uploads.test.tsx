import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../src/auth/AuthProvider';
import { routes } from '../../src/routes';
import { sessionHandler } from '../msw/handlers';
import { server } from '../setup';

// The uploads flow end to end: the real router + PostForm/EditProfile +
// ImageUploadField + api/uploads + client.ts against MSW. The default handlers sign a
// fake S3 URL and 200 the direct PUT, so selecting a file runs the real presign→PUT
// path and the form submits the returned key.
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

function fileOf(type = 'image/jpeg'): File {
  return new File([new Uint8Array(8)], 'pic.jpg', { type });
}

function detail(overrides: Record<string, unknown>) {
  return {
    id: 1,
    title: 'Alpha',
    excerpt: 'Body.',
    content: 'Full body of Alpha.',
    imageKey: null,
    imageUrl: null,
    updatedAt: null,
    author: { username: 'andres', avatarUrl: null },
    categories: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    bookmarkedByMe: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Uploads', () => {
  it('creates a post with an uploaded image, sending imageKey', async () => {
    authAs('andres');
    let sent: { imageKey?: string | null } | null = null;
    server.use(
      http.post('*/api/posts', async ({ request }) => {
        sent = (await request.json()) as { imageKey?: string | null };
        return HttpResponse.json(detail({ id: 100, title: 'My New Post' }), { status: 201 });
      }),
      http.get('*/api/posts/100', () => HttpResponse.json(detail({ id: 100, title: 'My New Post' }))),
    );
    const user = userEvent.setup();
    renderAppAt('/posts/new');

    await user.type(await screen.findByLabelText('Title'), 'My New Post');
    await user.type(screen.getByLabelText('Body'), 'Body text.');
    await user.upload(screen.getByLabelText('Image'), fileOf());

    // Wait for the upload to finish (submit is disabled while pending).
    const publish = screen.getByRole('button', { name: 'Publish' });
    await waitFor(() => expect(publish).toBeEnabled());
    await user.click(publish);

    expect(await screen.findByRole('heading', { name: 'My New Post' })).toBeInTheDocument();
    expect(sent!.imageKey).toBe('posts/generated.jpg');
  });

  it('omits imageKey when the edit leaves the image untouched', async () => {
    authAs('andres');
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.get('*/api/posts/1', () => HttpResponse.json(detail({ imageUrl: 'https://cdn.test/posts/1.jpg' }))),
      http.patch('*/api/posts/1', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(detail({ title: 'Alpha Edited' }));
      }),
    );
    const user = userEvent.setup();
    renderAppAt('/posts/1/edit');

    const title = await screen.findByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Alpha Edited');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByRole('heading', { name: 'Alpha' });
    expect(sent).not.toHaveProperty('imageKey'); // untouched → preserved
  });

  it('sends imageKey null when the image is removed', async () => {
    authAs('andres');
    let sent: { imageKey?: string | null } | null = null;
    server.use(
      http.get('*/api/posts/1', () => HttpResponse.json(detail({ imageUrl: 'https://cdn.test/posts/1.jpg' }))),
      http.patch('*/api/posts/1', async ({ request }) => {
        sent = (await request.json()) as { imageKey?: string | null };
        return HttpResponse.json(detail({}));
      }),
    );
    const user = userEvent.setup();
    renderAppAt('/posts/1/edit');

    await screen.findByLabelText('Title');
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByRole('heading', { name: 'Alpha' });
    expect(sent!.imageKey).toBeNull();
  });

  it('uploads a new avatar on Edit profile, sending avatarKey', async () => {
    authAs('andres');
    let sent: { avatarKey?: string | null } | null = null;
    server.use(
      http.patch('*/api/users/me', async ({ request }) => {
        sent = (await request.json()) as { avatarKey?: string | null };
        return HttpResponse.json({
          username: 'andres',
          bio: null,
          avatarUrl: 'https://cdn.test/avatars/generated.jpg',
          createdAt: '2026-01-01T00:00:00.000Z',
          postCount: 0,
          followerCount: 0,
          followingCount: 0,
          followedByMe: false,
        });
      }),
    );
    const user = userEvent.setup();
    renderAppAt('/settings/profile');

    await user.upload(await screen.findByLabelText('Avatar'), fileOf('image/png'));
    const save = screen.getByRole('button', { name: 'Save' });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    // Landed on the profile (navigated away from the form).
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.avatarKey).toBe('avatars/generated.jpg');
  });

  it('renders the post hero image on detail when imageUrl is set', async () => {
    server.use(
      http.get('*/api/posts/1', () => HttpResponse.json(detail({ imageUrl: 'https://cdn.test/posts/1.jpg' }))),
    );
    renderAppAt('/posts/1');

    const hero = await screen.findByRole('img', { name: 'Alpha' });
    expect(hero).toHaveAttribute('src', 'https://cdn.test/posts/1.jpg');
  });
});
