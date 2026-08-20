import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as usersApi from '../api/users';
import { useFollowToggle } from './useFollowToggle';

// Mirrors usePostToggles.test — the optimistic/rollback/redirect logic in isolation.

const navigate = vi.fn();
let authStatus: 'authenticated' | 'anonymous' = 'authenticated';

vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ status: authStatus }) }));
vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/here' }),
}));
vi.mock('../api/users');

describe('useFollowToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStatus = 'authenticated';
  });

  it('reconciles with the returned FollowState and reports it', async () => {
    vi.mocked(usersApi.followUser).mockResolvedValue({
      username: 'bianca',
      followedByMe: true,
      followerCount: 11,
    });
    const onChange = vi.fn();
    const { result } = renderHook(() => useFollowToggle('bianca', false, onChange));

    await act(async () => {
      await result.current.toggle();
    });

    expect(usersApi.followUser).toHaveBeenCalledWith('bianca');
    expect(result.current.following).toBe(true);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ followerCount: 11 }));
  });

  it('rolls back on a failed request', async () => {
    vi.mocked(usersApi.followUser).mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useFollowToggle('bianca', false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.following).toBe(false);
  });

  it('redirects an anonymous visitor and fires no request', async () => {
    authStatus = 'anonymous';
    const { result } = renderHook(() => useFollowToggle('bianca', false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(navigate).toHaveBeenCalledWith('/login', { state: { from: { pathname: '/here' } } });
    expect(usersApi.followUser).not.toHaveBeenCalled();
  });
});
