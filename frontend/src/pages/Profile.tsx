import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { isApiError } from '../api/client';
import { getUserProfile, listUserPosts } from '../api/users';
import { useAuth } from '../auth/useAuth';
import { Avatar } from '../components/Avatar';
import { FollowButton } from '../components/FollowButton';
import { PostCardList } from '../components/PostCardList';
import { useAsync } from '../hooks/useAsync';
import { formatDate } from '../lib/date';
import styles from './Profile.module.css';

// Your own profile shows Edit profile; anyone else's shows Follow. The data
// is the same either way.
export function Profile() {
  const { username = '' } = useParams();
  const { user } = useAuth();

  const state = useAsync((signal) => getUserProfile(username, signal), [username]);

  // Memoised so PostCardList's useAsync dep is stable across renders.
  const loadPosts = useCallback(
    (page: number, signal: AbortSignal) => listUserPosts(username, { page }, signal),
    [username],
  );

  // After a follow or unfollow here, the follower count comes from the server's
  // FollowState.
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
        <div className={styles.identity}>
          <Avatar url={profile.avatarUrl} name={profile.username} size="lg" />
          <h1 className={styles.username}>{profile.username}</h1>
        </div>
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
