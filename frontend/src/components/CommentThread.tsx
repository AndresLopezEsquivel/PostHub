import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';

import { type Paginated, isApiError } from '../api/client';
import { type Comment, createComment, deleteComment, listPostComments } from '../api/comments';
import { useAuth } from '../auth/useAuth';
import { useAsync } from '../hooks/useAsync';
import { formatDate } from '../lib/date';
import { Avatar } from './Avatar';
import styles from './CommentThread.module.css';

// Owns the paged list, Load more, the compose box and deleting your own
// comments; PostDetail only passes the post id.
//
// Comments are oldest first, so the compose box is below the list and a new
// comment is appended.
export function CommentThread({ postId }: { postId: number }) {
  const { status: authStatus, user } = useAuth();
  const location = useLocation();

  // page drives the fetch; items accumulates every loaded page so "Load more" grows
  // the list instead of replacing it, and so compose/delete can edit that same list.
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  // The last envelope added to items, compared by reference, not by page
  // number. Right after page changes, pageState.data still holds the previous
  // page, so a page-number check would add that page again and skip the new one.
  // The envelope's own page decides between replacing and appending.
  const folded = useRef<Paginated<Comment> | null>(null);

  // Reset when the post changes, such as going from one post to another
  // without unmounting.
  useEffect(() => {
    setPage(1);
    setItems([]);
    setTotal(0);
    folded.current = null;
  }, [postId]);

  const pageState = useAsync(
    (signal) => listPostComments(postId, { page }, signal),
    [postId, page],
  );

  useEffect(() => {
    const envelope = pageState.data;
    if (pageState.status === 'success' && envelope && envelope !== folded.current) {
      folded.current = envelope;
      setItems((prev) => (envelope.page === 1 ? envelope.data : [...prev, ...envelope.data]));
      setTotal(envelope.total);
    }
  }, [pageState.status, pageState.data]);

  const [draft, setDraft] = useState('');
  const [composeError, setComposeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setComposeError(null);
    if (!draft.trim()) {
      setComposeError('Content is required');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createComment(postId, { content: draft.trim() });
      // Append the server's comment and update the count, with no refetch.
      setItems((prev) => [...prev, created]);
      setTotal((t) => t + 1);
      setDraft('');
    } catch (error) {
      setComposeError(
        isApiError(error) ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    setActionError(null);
    try {
      await deleteComment(id);
      setItems((prev) => prev.filter((c) => c.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (error) {
      setActionError(
        isApiError(error) ? error.message : 'Could not delete the comment. Please try again.',
      );
    }
  }

  const hasMore = items.length < total;
  const initialLoading = pageState.status === 'loading' && items.length === 0;
  const initialError = pageState.status === 'error' && items.length === 0;

  return (
    <section className={styles.thread} aria-label="Comments">
      <h2>Comments ({total})</h2>

      {authStatus === 'authenticated' ? (
        <form className={styles.compose} onSubmit={handleSubmit}>
          <label htmlFor="comment-draft" className={styles.label}>
            Add a comment
          </label>
          <textarea
            id="comment-draft"
            name="content"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={composeError ? true : undefined}
          />
          {composeError && (
            <p role="alert" className={styles.error}>
              {composeError}
            </p>
          )}
          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? 'Posting…' : 'Post comment'}
          </button>
        </form>
      ) : (
        // Anonymous users get a login link that brings them back here.
        <p className={styles.loginPrompt}>
          <Link to="/login" state={{ from: location }}>
            Log in
          </Link>{' '}
          to comment.
        </p>
      )}

      {actionError && (
        <p role="alert" className={styles.error}>
          {actionError}
        </p>
      )}

      {initialLoading && <p role="status">Loading comments…</p>}

      {initialError && (
        <div role="alert" className={styles.error}>
          <p>Could not load comments.</p>
          <button type="button" onClick={pageState.reload}>
            Try again
          </button>
        </div>
      )}

      {!initialLoading && !initialError && items.length === 0 && (
        <p className={styles.empty}>No comments yet.</p>
      )}

      {items.length > 0 && (
        <ul role="list" className={styles.list}>
          {items.map((comment) => (
            <li key={comment.id} className={styles.comment}>
              <p className={styles.meta}>
                <Avatar url={comment.author.avatarUrl} name={comment.author.username} size="sm" />
                <Link to={`/users/${comment.author.username}`}>{comment.author.username}</Link>
                <span aria-hidden="true"> · </span>
                <time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
                {comment.updatedAt && <span className={styles.edited}> · edited</span>}
              </p>
              <p className={styles.body}>{comment.content}</p>
              {/* Usernames are compared because the API exposes no user id. This only
                  hides the button; the backend's 403 is the real check. */}
              {user?.username === comment.author.username && (
                <button
                  type="button"
                  className={styles.delete}
                  onClick={() => void handleDelete(comment.id)}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          className={styles.loadMore}
          disabled={pageState.status === 'loading'}
          onClick={() => setPage((p) => p + 1)}
        >
          Load more ({total - items.length} remaining)
        </button>
      )}
    </section>
  );
}
