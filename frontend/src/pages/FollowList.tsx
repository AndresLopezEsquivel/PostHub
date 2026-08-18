import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { isApiError } from '../api/client';
import { listFollowers, listFollowing } from '../api/users';
import { useAuth } from '../auth/useAuth';
import { FollowButton } from '../components/FollowButton';
import { useAsync } from '../hooks/useAsync';
import styles from './FollowList.module.css';

// docs/screens.md §10 — "Two lists sharing one screen". Public. Two routes render
// this one component with a different `tab`, so the tab lives in the URL: each list
// deep-links and Back/Forward move between them. Each row carries its own
// followedByMe, so its follow button needs no second request.
export function FollowList({ tab }: { tab: 'followers' | 'following' }) {
  const { username = '' } = useParams();
  const { user } = useAuth();
  const [page, setPage] = useState(1);

  // Reset to page 1 when the target or the tab changes.
  useEffect(() => setPage(1), [username, tab]);

  const state = useAsync(
    (signal) =>
      (tab === 'followers' ? listFollowers : listFollowing)(username, { page }, signal),
    [username, tab, page],
  );

  const result = state.data;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;

  const notFound = state.status === 'error' && isApiError(state.error) && state.error.status === 404;

  return (
    <section className={styles.page}>
      <p className={styles.who}>
        <Link to={`/users/${username}`}>{username}</Link>
      </p>

      <nav className={styles.tabs} aria-label="Followers and following">
        <Link
          to={`/users/${username}/followers`}
          aria-current={tab === 'followers' ? 'page' : undefined}
          className={tab === 'followers' ? styles.tabActive : undefined}
        >
          Followers
        </Link>
        <Link
          to={`/users/${username}/following`}
          aria-current={tab === 'following' ? 'page' : undefined}
          className={tab === 'following' ? styles.tabActive : undefined}
        >
          Following
        </Link>
      </nav>

      {state.status === 'loading' && <p role="status">Loading…</p>}

      {state.status === 'error' && (
        <div role="alert" className={styles.notice}>
          <p>{notFound ? 'User not found' : 'Something went wrong.'}</p>
          {!notFound && (
            <button type="button" onClick={state.reload}>
              Try again
            </button>
          )}
        </div>
      )}

      {state.status === 'success' && result && (
        <>
          {result.data.length === 0 ? (
            <p className={styles.notice}>
              {tab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </p>
          ) : (
            <ul className={styles.list}>
              {result.data.map((row) => (
                <li key={row.username} className={styles.row}>
                  <div className={styles.rowMain}>
                    <Link to={`/users/${row.username}`} className={styles.rowName}>
                      {row.username}
                    </Link>
                    {row.bio && <p className={styles.rowBio}>{row.bio}</p>}
                  </div>
                  {/* Can't follow yourself — hide the button on your own row. */}
                  {user?.username !== row.username && (
                    <FollowButton username={row.username} initialFollowing={row.followedByMe} />
                  )}
                </li>
              ))}
            </ul>
          )}

          {result.total > result.limit && (
            <nav className={styles.pager} aria-label="Pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ‹ Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next ›
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
