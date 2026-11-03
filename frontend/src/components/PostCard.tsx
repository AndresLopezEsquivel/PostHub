import { Link } from 'react-router';

import type { BookmarkState } from '../api/bookmarks';
import type { PostCard as PostCardData } from '../api/posts';
import { formatDate } from '../lib/date';
import { Avatar } from './Avatar';
import { EngagementBar } from './EngagementBar';
import styles from './PostCard.module.css';

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
              {/* Explore's filters live in the URL, so a category tag is just a link to
                  the filtered list. */}
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
