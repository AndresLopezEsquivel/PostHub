import type { BookmarkState } from '../api/bookmarks';
import { type Engageable, usePostToggles } from '../hooks/usePostToggles';
import styles from './EngagementBar.module.css';

// The like and bookmark buttons for PostCard and PostDetail; the state lives
// in usePostToggles. It takes only the fields both carry, so either can pass
// itself.
//
// State is shown with aria-pressed, and the aria-label stays "Like" or
// "Bookmark" so the button's name doesn't change under the user. Anyone can
// see the like count; clicking is what requires login.
export function EngagementBar({
  post,
  onBookmarkChange,
}: {
  post: Engageable;
  onBookmarkChange?: (state: BookmarkState) => void;
}) {
  const { liked, likeCount, bookmarked, likePending, bookmarkPending, toggleLike, toggleBookmark } =
    usePostToggles(post, onBookmarkChange);

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.button}
        aria-label="Like"
        aria-pressed={liked}
        disabled={likePending}
        onClick={() => void toggleLike()}
      >
        <span aria-hidden="true" className={liked ? styles.hearted : styles.heart}>
          ♥
        </span>{' '}
        {likeCount}
      </button>

      <button
        type="button"
        className={styles.button}
        aria-label="Bookmark"
        aria-pressed={bookmarked}
        disabled={bookmarkPending}
        onClick={() => void toggleBookmark()}
      >
        {bookmarked ? 'Bookmarked' : 'Bookmark'}
      </button>
    </div>
  );
}
