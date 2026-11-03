import { useState } from 'react';

import { isApiError } from '../api/client';
import { deletePost } from '../api/posts';
import styles from './DeletePostButton.module.css';

// A two-step delete in place, used by PostDetail and EditPost: the first
// click shows a confirm prompt instead of a modal or window.confirm.
// onDeleted runs only after the DELETE succeeds, and the caller decides where
// to go.
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
