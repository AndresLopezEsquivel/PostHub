export function Notifications() {
  // docs/screens.md §11 — Notifications. Self only.
  // TODO(pass 8): GET /api/notifications (?unread=true filters data/total, while
  // unreadCount always reports the full tally — that is the navbar badge, and it
  // rides in this envelope so the badge costs no second request). Plus PATCH
  // /api/notifications/:id { isRead } and POST /api/notifications/read-all.
  return (
    <section>
      <h1>Notifications</h1>
      <p>Not implemented yet.</p>
    </section>
  );
}
