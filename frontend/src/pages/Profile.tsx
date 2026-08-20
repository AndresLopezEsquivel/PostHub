import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { isApiError } from '../api/client';
import { getUserProfile, listUserPosts } from '../api/users';
import { useAuth } from '../auth/useAuth';
import { FollowButton } from '../components/FollowButton';
import { PostCardList } from '../components/PostCardList';
import { useAsync } from '../hooks/useAsync';
import { formatDate } from '../lib/date';
import styles from './Profile.module.css';

// docs/screens.md §8 — Profile. Public. One screen, two modes: self vs other. The
// mode changes which action shows (Edit profile vs Follow), not which data loads.
export function Profile() {
  const { username = '' } = useParams();
  const { user } = useAuth();

  const state = useAsync((signal) => getUserProfile(username, signal), [username]);

  // Memoised so PostCardList's useAsync dep is stable across renders.
  const loadPosts = useCallback(
    (page: number, signal: AbortSignal) => listUserPosts(username, { page }, signal),
    [username],
  );

  // The follower count updates optimistically when you follow/unfollow from here.
  const [followerOverride, setFollowerOverride] = useState<number | null>(null);
  useEffect(() => setFollowerOverride(null), [username]);

  if (state.status === 'loading') {
    return (
      <section className={styles.page}>
        <p role="status">Loading…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    const notFound = isApiError(state.error) && state.error.status === 404;
    return (
      <section className={styles.page}>
        <div role="alert" className={styles.notFound}>
          <h1>{notFound ? 'User not found' : 'Something went wrong'}</h1>
          <Link to="/">Back to Explore</Link>
        </div>
      </section>
    );
  }

  const profile = state.data!;
  const isSelf = user?.username === profile.username;
  const followerCount = followerOverride ?? profile.followerCount;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.username}>{profile.username}</h1>
        {profile.bio && <p className={styles.bio}>{profile.bio}</p>}
        <p className={styles.joined}>Joined {formatDate(profile.createdAt)}</p>

        <p className={styles.counts}>
          <span>{profile.postCount} posts</span>
          <span aria-hidden="true"> · </span>
          <Link to={`/users/${profile.username}/followers`}>{followerCount} followers</Link>
          <span aria-hidden="true"> · </span>
          <Link to={`/users/${profile.username}/following`}>
            {profile.followingCount} following
          </Link>
        </p>

        {isSelf ? (
          <Link to="/settings/profile" className={styles.editLink}>
            Edit profile
          </Link>
        ) : (
          <FollowButton
            username={profile.username}
            initialFollowing={profile.followedByMe}
            onChange={(s) => setFollowerOverride(s.followerCount)}
          />
        )}
      </header>

      <h2 className={styles.postsHeading}>Posts</h2>
      <PostCardList load={loadPosts} empty="No posts yet." />
    </section>
  );
}
