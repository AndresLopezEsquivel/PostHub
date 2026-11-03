import { type ReactNode, useEffect, useState } from 'react';

import { isApiError, type Paginated } from '../api/client';
import type { PostCard as PostCardData } from '../api/posts';
import { useAsync } from '../hooks/useAsync';
import { PostCard } from './PostCard';
import styles from './PostCardList.module.css';

// A paginated list of PostCards, with the page in local state. Explore doesn't
// use it: its filters and page live in the URL so they can be shared.
//
// The caller wraps load in useCallback so it is a stable dependency here.
export function PostCardList({
  load,
  empty,
  removeOnUnbookmark = false,
}: {
  load: (page: number, signal: AbortSignal) => Promise<Paginated<PostCardData>>;
  empty: ReactNode;
  // Bookmarks sets this so an unbookmarked card leaves the list at once. It's a
  // callback within this list, not a shared store.
  removeOnUnbookmark?: boolean;
}) {
  const [page, setPage] = useState(1);
  const state = useAsync((signal) => load(page, signal), [page, load]);

  // Ids removed since the current page loaded; cleared whenever a fresh page arrives.
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  useEffect(() => setRemoved(new Set()), [state.data]);

  const result = state.data;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  const items = result ? result.data.filter((p) => !removed.has(p.id)) : [];

  if (state.status === 'loading') {
    return <p role="status">Loading…</p>;
  }

  if (state.status === 'error') {
    return (
      <div role="alert" className={styles.error}>
        <p>{isApiError(state.error) ? state.error.message : 'Something went wrong.'}</p>
        <button type="button" onClick={state.reload}>
          Try again
        </button>
      </div>
    );
  }

  if (!result || items.length === 0) {
    return <div className={styles.empty}>{empty}</div>;
  }

  return (
    <>
      <div className={styles.list}>
        {items.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onBookmarkChange={
              removeOnUnbookmark
                ? (s) => {
                    if (!s.bookmarkedByMe) {
                      setRemoved((prev) => new Set(prev).add(post.id));
                    }
                  }
                : undefined
            }
          />
        ))}
      </div>

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
  );
}
