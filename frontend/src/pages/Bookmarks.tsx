import { useCallback } from 'react';

import { listBookmarks } from '../api/bookmarks';
import { PostCardList } from '../components/PostCardList';
import styles from './CardListPage.module.css';

// docs/screens.md §12 — Bookmarks. Self only (route under RequireAuth). The saved
// posts through the same <PostCard> as Explore — the fourth data source for one
// component. removeOnUnbookmark drops a card the moment its bookmark is toggled off,
// so the list never shows a post you've just removed.
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
