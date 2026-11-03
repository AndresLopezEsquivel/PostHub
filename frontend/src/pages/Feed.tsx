import { useCallback } from 'react';
import { Link } from 'react-router';

import { listFeed } from '../api/feed';
import { PostCardList } from '../components/PostCardList';
import styles from './CardListPage.module.css';

// A user who follows no one gets an empty page (a 200, not an error), so the
// empty state is a call to action.
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
