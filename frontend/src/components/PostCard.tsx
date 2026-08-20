import { Link } from 'react-router';

import type { BookmarkState } from '../api/bookmarks';
import type { PostCard as PostCardData } from '../api/posts';
import { formatDate } from '../lib/date';
import { Avatar } from './Avatar';
import { EngagementBar } from './EngagementBar';
import styles from './PostCard.module.css';

// The <postCard> rendered once, reused by Explore first and then Post detail's
// related lists, Feed, Bookmarks, and Profile posts. The like/bookmark state lives
// in <EngagementBar> (pass 4), so the card itself stays a thin composition with no
// state of its own, and every list consumer got the interactive toggle for free.
// The comment count stays a static label — comment interaction happens on detail.
//
// The author avatar renders through <Avatar>, which falls back to an initial when
// avatarUrl is null (unconfigured S3 or no avatar), so the card degrades cleanly.

export function PostCard({
  post,
  onBookmarkChange,
}: {
  post: PostCardData;
  onBookmarkChange?: (state: BookmarkState) => void;
}) {
  return (
    <article className={styles.card}>
      <h2 className={styles.title}>
        <Link to={`/posts/${post.id}`}>{post.title}</Link>
      </h2>

      <p className={styles.meta}>
        <Avatar url={post.author.avatarUrl} name={post.author.username} size="sm" />
        by <Link to={`/users/${post.author.username}`}>{post.author.username}</Link>
        <span aria-hidden="true"> · </span>
        <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
      </p>

      <p className={styles.excerpt}>{post.excerpt}</p>

      {post.categories.length > 0 && (
        <ul className={styles.tags}>
          {post.categories.map((category) => (
            <li key={category.slug}>
              {/* Filtering Explore is a URL change, so a category tag is just a link
                  to the filtered list — deep-linkable and shareable like every other
                  filter state. */}
              <Link to={`/?category=${category.slug}`} className={styles.tag}>
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.engagement}>
        <EngagementBar post={post} onBookmarkChange={onBookmarkChange} />
        <span className={styles.commentCount}>{post.commentCount} comments</span>
      </div>
    </article>
  );
}
