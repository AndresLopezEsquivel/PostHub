export function FollowList({ tab }: { tab: 'followers' | 'following' }) {
  // docs/screens.md §10 — "Two lists sharing one screen". Public.
  // Two routes render this one component so the tab lives in the URL: each list
  // deep-links, and Back/Forward move between them.
  // TODO(pass 6): GET /api/users/:username/{followers,following}. Each row carries
  // its own followedByMe, so the per-row follow button needs no second request.
  return (
    <section>
      <h1>{tab === 'followers' ? 'Followers' : 'Following'}</h1>
      <p>Not implemented yet.</p>
    </section>
  );
}
