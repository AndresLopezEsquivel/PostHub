import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { type FollowState, followUser, unfollowUser } from '../api/users';
import { useAuth } from '../auth/useAuth';

// The optimistic follow toggle — the same shape as usePostToggles (pass 4), for the
// follow button on Profile and on every followers/following row. Local optimistic
// state, reconciled with the returned FollowState, rolled back on error; an
// anonymous click redirects to login. onChange lets a caller (Profile) react to the
// authoritative FollowState — e.g. update the header follower count.
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
