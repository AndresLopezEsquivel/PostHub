export function CreatePost() {
  // docs/screens.md §6 — Create post. Authenticated only.
  // TODO(pass 5): POST /api/posts { title, content, categoryIds, imageKey }.
  // categoryIds come from GET /api/categories (a bare array, not the envelope) —
  // the ids are NOT in the categories carried on a postCard, which have only
  // name and slug. Image upload lands in pass 9.
  return (
    <section>
      <h1>Create post</h1>
      <p>Not implemented yet.</p>
    </section>
  );
}
