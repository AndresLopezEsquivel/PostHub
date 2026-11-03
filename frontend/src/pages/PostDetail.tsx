import { Link, useNavigate, useParams } from 'react-router';

import { isApiError } from '../api/client';
import { getPost } from '../api/posts';
import { useAuth } from '../auth/useAuth';
import { Avatar } from '../components/Avatar';
import { CommentThread } from '../components/CommentThread';
import { DeletePostButton } from '../components/DeletePostButton';
import { EngagementBar } from '../components/EngagementBar';
import { useAsync } from '../hooks/useAsync';
import { formatDate } from '../lib/date';
import styles from './PostDetail.module.css';

export function PostDetail() {
  const { postId } = useParams();
  const id = Number(postId);
  const navigate = useNavigate();
  const { user } = useAuth();

  const state = useAsync((signal) => getPost(id, signal), [id]);

  if (state.status === 'loading') {
    return (
      <section className={styles.page}>
        <p role="status">Loading…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    // A missing post is a state of this screen, not an unmatched URL, so it's
    // shown here instead of redirecting to NotFound. A 404 gets its own message;
    // any other error gets a retry.
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
          <Avatar url={post.author.avatarUrl} name={post.author.username} size="sm" />
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

        {post.imageUrl && (
          <img className={styles.heroImage} src={post.imageUrl} alt={post.title} />
        )}

        <div className={styles.body}>{post.content}</div>

        <EngagementBar post={post} />

        {/* Author-only controls. Usernames are compared because the API exposes no
            user id; the backend's 403 on PATCH and DELETE is the real check. */}
        {user?.username === post.author.username && (
          <div className={styles.authorActions}>
            <Link to={`/posts/${post.id}/edit`} className={styles.editLink}>
              Edit
            </Link>
            <DeletePostButton postId={post.id} onDeleted={() => void navigate('/')} />
          </div>
        )}
      </article>

      <CommentThread postId={post.id} />
    </section>
  );
}
