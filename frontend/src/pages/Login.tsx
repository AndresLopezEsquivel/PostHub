export function Login() {
  // docs/screens.md §2 — Login. Anonymous only.
  // TODO(pass 1): POST /api/auth/login via useAuth().login. Maps 401 "Invalid
  // credentials" to a form-level error, and honours location.state.from so the
  // user lands back on the screen RequireAuth bounced them off.
  // NOTE: the backend authenticates on email only — see api/auth.ts LoginInput.
  return (
    <section>
      <h1>Log in</h1>
      <p>Not implemented yet.</p>
    </section>
  );
}
