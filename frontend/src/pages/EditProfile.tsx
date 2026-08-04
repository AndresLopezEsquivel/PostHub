export function EditProfile() {
  // docs/screens.md §9 — Edit profile. Self only.
  // TODO(pass 6): PATCH /api/users/me with any subset of bio, avatarKey, email,
  // password. It accepts avatarKey but answers with avatarUrl — the pair is not
  // symmetric. Sending a username field is a 400, by design: usernames are
  // immutable, so the form must not offer the field at all.
  return (
    <section>
      <h1>Edit profile</h1>
      <p>Not implemented yet.</p>
    </section>
  );
}
