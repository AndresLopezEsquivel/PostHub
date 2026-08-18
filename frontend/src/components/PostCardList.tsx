import { useState } from 'react';

import { isApiError, type Paginated } from '../api/client';
import type { PostCard as PostCardData } from '../api/posts';
import { useAsync } from '../hooks/useAsync';
import { PostCard } from './PostCard';
import styles from './PostCardList.module.css';

// A paginated PostCard list — the loading/empty/error triad + cards + Prev/Next,
// with page in local state. Extracted from Explore's shape so Profile's posts (and
// Feed/Bookmarks in pass 7) reuse it. Explore keeps its own copy because its filter
// state is URL-bound, which is that screen's distinguishing feature; the plain lists
// don't need shareable pagination.
//
// `load` is the only source of data; the caller memoises it (useCallback keyed on
// its own inputs, e.g. the username) so it is a stable dep here.
export function PostCardList({
  load,
  emptyMessage,
}: {
  load: (page: number, signal: AbortSignal) => Promise<Paginated<PostCardData>>;
  emptyMessage: string;
}) {
  const [page, setPage] = useState(1);
  const state = useAsync((signal) => load(page, signal), [page, load]);

  const result = state.data;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;

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

  if (!result || result.data.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <>
      <div className={styles.list}>
        {result.data.map((post) => (
          <PostCard key={post.id} post={post} />
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
