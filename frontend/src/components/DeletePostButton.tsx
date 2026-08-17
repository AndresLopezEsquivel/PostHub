import { useState } from 'react';

import { isApiError } from '../api/client';
import { deletePost } from '../api/posts';
import styles from './DeletePostButton.module.css';

// The destructive-action confirmation this pass establishes: an inline two-step
// delete, reused by both PostDetail and EditPost. First click swaps the button for
// a "Delete this post? [Delete] [Cancel]" prompt in place — no modal, no
// window.confirm. onDeleted fires only after the DELETE succeeds; the caller decides
// where to go (both current callers navigate to Explore).
export function DeletePostButton({
  postId,
  onDeleted,
}: {
  postId: number;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await deletePost(postId);
      onDeleted();
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Could not delete the post. Please try again.');
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" className={styles.trigger} onClick={() => setConfirming(true)}>
        Delete
      </button>
    );
  }

  return (
    <span className={styles.confirm} role="group" aria-label="Confirm delete">
      <span>Delete this post?</span>
      <button
        type="button"
        className={styles.confirmDelete}
        disabled={deleting}
        onClick={() => void handleDelete()}
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={deleting}>
        Cancel
      </button>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </span>
  );
}
