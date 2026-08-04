export function Register() {
  // docs/screens.md §1 — Register. Anonymous only.
  // TODO(pass 1): POST /api/auth/register via useAuth().register. Establishes the
  // ApiError.field -> form-field error mapping every later form reuses (409 on a
  // taken username/email carries field: "username" | "email"). The UI must make
  // clear that the username is permanent — it can never be changed.
  return (
    <section>
      <h1>Register</h1>
      <p>Not implemented yet.</p>
    </section>
  );
}
