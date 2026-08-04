export function EditPost() {
  // docs/screens.md §7 — Edit post. Author only.
  // TODO(pass 5): GET the post to pre-fill, then PATCH /api/posts/:postId with a
  // partial body. Re-send the existing imageKey so an edit does not drop the
  // image. The route is only RequireAuth-guarded; compare post.author.username to
  // the session username after load to render the not-yours state. The real gate
  // is the backend 403.
  return (
    <section>
      <h1>Edit post</h1>
      <p>Not implemented yet.</p>
    </section>
  );
}
