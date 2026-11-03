import { useCallback } from 'react';

import { listBookmarks } from '../api/bookmarks';
import { PostCardList } from '../components/PostCardList';
import styles from './CardListPage.module.css';

export function Bookmarks() {
  const load = useCallback(
    (page: number, signal: AbortSignal) => listBookmarks({ page }, signal),
    [],
  );

  return (
    <section className={styles.page}>
      <h1>Bookmarks</h1>
      <PostCardList
        load={load}
        removeOnUnbookmark
        empty="You haven't bookmarked any posts yet."
      />
    </section>
  );
}
