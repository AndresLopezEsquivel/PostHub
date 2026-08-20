import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

import { listCategories } from '../api/categories';
import { isApiError } from '../api/client';
import { listPosts, type SortOrder } from '../api/posts';
import { PostCard } from '../components/PostCard';
import { useAsync } from '../hooks/useAsync';
import styles from './Explore.module.css';

// docs/screens.md §3 — Explore. Every post on the site; public, engagement gated.
//
// The URL is the single source of filter state (useSearchParams), so every view is
// shareable and Back/Forward moves between filters. The fetch runs through useAsync,
// keyed on the four params, which gives the loading/empty/error triad every later
// list screen reuses. Search arrives from the nav bar as ?search=; category and sort
// are this screen's own controls.

function readSort(value: string | null): SortOrder {
  return value === 'likes' ? 'likes' : 'newest';
}

function readPage(value: string | null): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function Explore() {
  const [params, setParams] = useSearchParams();

  const search = params.get('search') ?? undefined;
  const category = params.get('category') ?? undefined;
  const sort = readSort(params.get('sort'));
  const page = readPage(params.get('page'));

  // Change a filter → write the URL and reset to page 1 (a narrower result set
  // makes the old page number meaningless). The pager is the one caller that keeps
  // the page, so it sets it after this runs.
  const updateFilter = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params);
      mutate(next);
      next.delete('page');
      setParams(next);
    },
    [params, setParams],
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      const next = new URLSearchParams(params);
      next.set('page', String(nextPage));
      setParams(next);
    },
    [params, setParams],
  );

  const categoriesState = useAsync((signal) => listCategories(signal), []);
  const postsState = useAsync(
    (signal) => listPosts({ search, category, sort, page }, signal),
    [search, category, sort, page],
  );

  const categories = categoriesState.data ?? [];
  const result = postsState.data;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;

  return (
    <section className={styles.page}>
      <h1>Explore</h1>

      <div className={styles.filters}>
        <label className={styles.filter}>
          <span>Category</span>
          <select
            value={category ?? ''}
            onChange={(e) =>
              updateFilter((next) => {
                if (e.target.value) next.set('category', e.target.value);
                else next.delete('category');
              })
            }
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.sort} role="group" aria-label="Sort">
          <button
            type="button"
            aria-pressed={sort === 'newest'}
            className={sort === 'newest' ? styles.sortActive : undefined}
            onClick={() => updateFilter((next) => next.delete('sort'))}
          >
            Newest
          </button>
          <button
            type="button"
            aria-pressed={sort === 'likes'}
            className={sort === 'likes' ? styles.sortActive : undefined}
            onClick={() => updateFilter((next) => next.set('sort', 'likes'))}
          >
            Most liked
          </button>
        </div>
      </div>

      {search && (
        <p className={styles.searchNote}>
          Results for <strong>{search}</strong>{' '}
          <button
            type="button"
            className={styles.clear}
            onClick={() => updateFilter((next) => next.delete('search'))}
          >
            clear
          </button>
        </p>
      )}

      {postsState.status === 'loading' && <p role="status">Loading posts…</p>}

      {postsState.status === 'error' && (
        <div role="alert" className={styles.error}>
          <p>
            {isApiError(postsState.error)
              ? postsState.error.message
              : 'Something went wrong loading posts.'}
          </p>
          <button type="button" onClick={postsState.reload}>
            Try again
          </button>
        </div>
      )}

      {postsState.status === 'success' && result && (
        <>
          {result.data.length === 0 ? (
            <p className={styles.empty}>No posts match your filters.</p>
          ) : (
            <div className={styles.list}>
              {result.data.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          {result.total > result.limit && (
            <nav className={styles.pager} aria-label="Pagination">
              <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                ‹ Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
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
