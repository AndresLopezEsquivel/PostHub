import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as bookmarksApi from '../api/bookmarks';
import * as likesApi from '../api/likes';
import { usePostToggles } from './usePostToggles';

// The optimistic/rollback/redirect logic in isolation — the part worth a unit test.
// Collaborators are mocked: the API modules, useAuth (status), and router navigation.

const navigate = vi.fn();
let authStatus: 'authenticated' | 'anonymous' = 'authenticated';

vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ status: authStatus }) }));
vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/here' }),
}));
vi.mock('../api/likes');
vi.mock('../api/bookmarks');

const post = { id: 1, likeCount: 3, likedByMe: false, bookmarkedByMe: false };

describe('usePostToggles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStatus = 'authenticated';
  });

  it('reconciles like state with the returned server values on success', async () => {
    vi.mocked(likesApi.likePost).mockResolvedValue({ postId: 1, likeCount: 4, likedByMe: true });
    const { result } = renderHook(() => usePostToggles(post));

    await act(async () => {
      await result.current.toggleLike();
    });

    expect(likesApi.likePost).toHaveBeenCalledWith(1);
    expect(result.current.liked).toBe(true);
    expect(result.current.likeCount).toBe(4);
  });

  it('rolls back the like on a failed request', async () => {
    vi.mocked(likesApi.likePost).mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => usePostToggles(post));

    await act(async () => {
      await result.current.toggleLike();
    });

    expect(result.current.liked).toBe(false);
    expect(result.current.likeCount).toBe(3);
  });

  it('rolls back the bookmark on a failed request', async () => {
    vi.mocked(bookmarksApi.bookmarkPost).mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => usePostToggles(post));

    await act(async () => {
      await result.current.toggleBookmark();
    });

    expect(result.current.bookmarked).toBe(false);
  });

  it('redirects an anonymous visitor to login and fires no request', async () => {
    authStatus = 'anonymous';
    const { result } = renderHook(() => usePostToggles(post));

    await act(async () => {
      await result.current.toggleLike();
    });

    expect(navigate).toHaveBeenCalledWith('/login', { state: { from: { pathname: '/here' } } });
    expect(likesApi.likePost).not.toHaveBeenCalled();
  });
});
