import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { PostCard as PostCardData } from '../api/posts';
import { PostCard } from './PostCard';

// EngagementBar reads useAuth through usePostToggles. It's mocked as
// anonymous so this test needs no AuthProvider; the toggles are covered by
// tests/integration/engagement.test.tsx.
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ status: 'anonymous', user: null }),
}));

const post: PostCardData = {
  id: 42,
  title: 'Hello World',
  excerpt: 'A short excerpt.',
  author: { username: 'andres', avatarUrl: null },
  categories: [{ name: 'Tech', slug: 'tech' }],
  likeCount: 3,
  commentCount: 5,
  likedByMe: false,
  bookmarkedByMe: false,
  createdAt: '2026-08-01T12:00:00.000Z',
};

function renderCard(data = post) {
  return render(
    <MemoryRouter>
      <PostCard post={data} />
    </MemoryRouter>,
  );
}

describe('PostCard', () => {
  it('renders the post and links title, author, and category to the right routes', () => {
    renderCard();

    expect(screen.getByRole('link', { name: 'Hello World' })).toHaveAttribute(
      'href',
      '/posts/42',
    );
    expect(screen.getByRole('link', { name: 'andres' })).toHaveAttribute('href', '/users/andres');
    expect(screen.getByRole('link', { name: 'Tech' })).toHaveAttribute('href', '/?category=tech');

    expect(screen.getByText('A short excerpt.')).toBeInTheDocument();
    // The like count is inside the Like button; the comment count is plain text.
    expect(screen.getByRole('button', { name: 'Like' })).toHaveTextContent('3');
    expect(screen.getByText('5 comments')).toBeInTheDocument();
  });

  it('omits the tag list when there are no categories', () => {
    renderCard({ ...post, categories: [] });

    expect(screen.queryByRole('link', { name: 'Tech' })).not.toBeInTheDocument();
  });
});
