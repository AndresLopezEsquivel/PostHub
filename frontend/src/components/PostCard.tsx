import { Link } from 'react-router';

import type { PostCard as PostCardData } from '../api/posts';
import { formatDate } from '../lib/date';
import styles from './PostCard.module.css';

// The <postCard> rendered once, reused by Explore first and then Post detail's
// related lists, Feed, Bookmarks, and Profile posts. Purely presentational: it
// takes a PostCard and renders it, with no fetching and no state of its own. That
// is what lets pass 4 add optimistic like/bookmark toggles by wrapping the count
// row here without any consumer changing — the counts are static labels today.
//
// No avatar image: author.avatarUrl is null on every endpoint until pass 9, so
// rendering an <img> would only ever show a broken source. The author is a link.

export function PostCard({ post }: { post: PostCardData }) {
  return (
    <article className={styles.card}>
      <h2 className={styles.title}>
        <Link to={`/posts/${post.id}`}>{post.title}</Link>
      </h2>

      <p className={styles.meta}>
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

      <p className={styles.counts}>
        <span>{post.likeCount} likes</span>
        <span aria-hidden="true"> · </span>
        <span>{post.commentCount} comments</span>
      </p>
    </article>
  );
}
