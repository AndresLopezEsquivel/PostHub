import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { type FollowState, followUser, unfollowUser } from '../api/users';
import { useAuth } from '../auth/useAuth';

// Optimistic follow toggle, like usePostToggles: it updates at once, takes the
// server's FollowState, and rolls back on error. An anonymous click goes to
// login. onChange gets the server's FollowState; Profile uses it to update the
// follower count.
export function useFollowToggle(
  username: string,
  initialFollowing: boolean,
  onChange?: (state: FollowState) => void,
) {
  const { status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (status !== 'authenticated') {
      void navigate('/login', { state: { from: location } });
      return;
    }
    if (pending) return;

    const prev = following;
    const next = !prev;
    setFollowing(next);
    setPending(true);
    try {
      const state = next ? await followUser(username) : await unfollowUser(username);
      setFollowing(state.followedByMe);
      onChange?.(state);
    } catch {
      setFollowing(prev);
    } finally {
      setPending(false);
    }
  }

  return { following, pending, toggle };
}
