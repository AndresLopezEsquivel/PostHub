export function Profile() {
  // docs/screens.md §8 — Profile. Public. One screen, two modes: self vs other.
  // The mode changes which actions appear, not which data loads.
  // TODO(pass 6): GET /api/users/:username (derived post/follower/following counts
  // + viewer-relative followedByMe) and GET /api/users/:username/posts.
  return (
    <section>
      <h1>Profile</h1>
      <p>Not implemented yet.</p>
    </section>
  );
}
