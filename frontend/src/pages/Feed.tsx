import { useCallback } from 'react';
import { Link } from 'react-router';

import { listFeed } from '../api/feed';
import { PostCardList } from '../components/PostCardList';
import styles from './CardListPage.module.css';

// docs/screens.md §4 — personalized feed. Authenticated only (route under
// RequireAuth). The same cards as Explore, scoped to followed authors.
//
// The empty state is a call to action, not an absence — that distinction is the
// whole reason Feed is a separate screen from Explore. A user who follows no one
// gets a 200 empty page (not a 401), and lands here.
export function Feed() {
  const load = useCallback(
    (page: number, signal: AbortSignal) => listFeed({ page }, signal),
    [],
  );

  return (
    <section className={styles.page}>
      <h1>Feed</h1>
      <PostCardList
        load={load}
        empty={
          <>
            Your feed is empty. Follow people to see their posts here —{' '}
            <Link to="/">explore posts</Link>.
          </>
        }
      />
    </section>
  );
}
