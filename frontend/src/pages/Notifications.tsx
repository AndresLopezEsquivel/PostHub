import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { isApiError } from '../api/client';
import {
  listNotifications,
  markAllRead,
  markNotificationRead,
  type NotificationItem,
  type NotificationType,
} from '../api/notifications';
import { useAsync } from '../hooks/useAsync';
import { formatDate } from '../lib/date';
import { useUnread } from '../notifications/useUnread';
import styles from './Notifications.module.css';

// docs/screens.md §11 — Notifications. Self only (route under RequireAuth). The
// side effects produced by likes/comments/follows, newest-first. Opening a
// notification marks it read and navigates to its source; unreadCount is shared
// with the nav badge via UnreadContext.

function actionText(type: NotificationType): string {
  if (type === 'like') return 'liked your post';
  if (type === 'comment') return 'commented on your post';
  return 'started following you';
}

// like/comment carry a post → open the post; a follow has no post → open the actor.
function targetOf(n: NotificationItem): string {
  return n.post ? `/posts/${n.post.id}` : `/users/${n.actor.username}`;
}

export function Notifications() {
  const { unreadCount, setUnreadCount } = useUnread();
  const [page, setPage] = useState(1);
  const state = useAsync((signal) => listNotifications({ page }, signal), [page]);

  // Local copy so opening a row can flip it to read without a refetch. Seeded from
  // each page; the response's unreadCount is pushed into the shared badge here too.
  const [items, setItems] = useState<NotificationItem[]>([]);
  useEffect(() => {
    if (state.data) {
      setItems(state.data.data);
      setUnreadCount(state.data.unreadCount);
    }
  }, [state.data, setUnreadCount]);

  const result = state.data;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;

  function handleOpen(n: NotificationItem) {
    if (n.isRead) return; // the <Link> still navigates
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    setUnreadCount(Math.max(0, unreadCount - 1));
    void markNotificationRead(n.id, true).catch(() => {});
  }

  async function handleMarkAll() {
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setUnreadCount(0);
    await markAllRead().catch(() => {});
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1>Notifications</h1>
        <button
          type="button"
          className={styles.markAll}
          disabled={unreadCount === 0}
          onClick={() => void handleMarkAll()}
        >
          Mark all read
        </button>
      </header>

      {state.status === 'loading' && <p role="status">Loading…</p>}

      {state.status === 'error' && (
        <div role="alert" className={styles.notice}>
          <p>{isApiError(state.error) ? state.error.message : 'Something went wrong.'}</p>
          <button type="button" onClick={state.reload}>
            Try again
          </button>
        </div>
      )}

      {state.status === 'success' && (
        <>
          {items.length === 0 ? (
            <p className={styles.notice}>No notifications yet.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    to={targetOf(n)}
                    onClick={() => handleOpen(n)}
                    className={n.isRead ? styles.row : `${styles.row} ${styles.unread}`}
                  >
                    {!n.isRead && (
                      <span className={styles.dot} aria-label="unread">
                        ●
                      </span>
                    )}
                    <span className={styles.text}>
                      <strong>{n.actor.username}</strong> {actionText(n.type)}
                      {n.post && <> “{n.post.title}”</>}
                    </span>
                    <time className={styles.time} dateTime={n.createdAt}>
                      {formatDate(n.createdAt)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {result && result.total > result.limit && (
            <nav className={styles.pager} aria-label="Pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ‹ Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next ›
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
