import { Link, useParams } from 'react-router';

import { isApiError } from '../api/client';
import { getPost } from '../api/posts';
import { CommentThread } from '../components/CommentThread';
import { EngagementBar } from '../components/EngagementBar';
import { useAsync } from '../hooks/useAsync';
import { formatDate } from '../lib/date';
import styles from './PostDetail.module.css';

// docs/screens.md §5 — Post detail. Public to read; writing (comments) requires
// auth, handled inside CommentThread.
//
// Deferred, matching CLAUDE.md's screen order: like/bookmark (pass 4), follow
// author (pass 6), and edit/delete post (pass 5). The like count is a static label
// for now, exactly as the card renders it.
export function PostDetail() {
  const { postId } = useParams();
  const id = Number(postId);

  const state = useAsync((signal) => getPost(id, signal), [id]);

  if (state.status === 'loading') {
    return (
      <section className={styles.page}>
        <p role="status">Loading…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    // A missing post is a state of THIS screen, not an unmatched URL — so render it
    // here rather than redirecting to the NotFound route. 404 gets its own copy;
    // anything else is a generic failure with a retry.
    const notFound = isApiError(state.error) && state.error.status === 404;
    return (
      <section className={styles.page}>
        <div role="alert" className={styles.notFound}>
          <h1>{notFound ? 'Post not found' : 'Something went wrong'}</h1>
          <p>
            {notFound
              ? 'This post may have been deleted.'
              : 'The post could not be loaded.'}
          </p>
          {notFound ? (
            <Link to="/">Back to Explore</Link>
          ) : (
            <button type="button" onClick={state.reload}>
              Try again
            </button>
          )}
        </div>
      </section>
    );
  }

  const post = state.data!;

  return (
    <section className={styles.page}>
      <article className={styles.post}>
        <h1 className={styles.title}>{post.title}</h1>

        <p className={styles.meta}>
          by <Link to={`/users/${post.author.username}`}>{post.author.username}</Link>
          <span aria-hidden="true"> · </span>
          <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
          {post.updatedAt && <span className={styles.edited}> · edited {formatDate(post.updatedAt)}</span>}
        </p>

        {post.categories.length > 0 && (
          <ul className={styles.tags}>
            {post.categories.map((category) => (
              <li key={category.slug}>
                <Link to={`/?category=${category.slug}`} className={styles.tag}>
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.body}>{post.content}</div>

        <EngagementBar post={post} />
      </article>

      <CommentThread postId={post.id} />
    </section>
  );
}
