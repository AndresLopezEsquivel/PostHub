import { type Engageable, usePostToggles } from '../hooks/usePostToggles';
import styles from './EngagementBar.module.css';

// The like + bookmark controls, shared by PostCard and PostDetail. All the state
// lives in usePostToggles; this is just the two buttons. Takes the minimal set of
// fields both a PostCard and a PostDetail carry, so either can pass itself.
//
// State is conveyed with aria-pressed (a stable aria-label — "Like"/"Bookmark" —
// keeps the accessible name from flipping under the user). The like count is public
// and shown to everyone; the click itself is what gates on auth (usePostToggles
// redirects an anonymous visitor to login).
export function EngagementBar({ post }: { post: Engageable }) {
  const { liked, likeCount, bookmarked, likePending, bookmarkPending, toggleLike, toggleBookmark } =
    usePostToggles(post);

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
