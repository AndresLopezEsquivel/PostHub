import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';

import { isApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { TextField } from '../components/TextField';
import styles from './AuthForm.module.css';
import { validateRegister, type RegisterErrors } from './authValidation';

// docs/screens.md §1 — Register. Anonymous only (the route sits under
// AnonymousOnly, which redirects an already-signed-in visitor to '/').
//
// This screen establishes the error-handling pattern every later form reuses:
//
//   1. Mirror the backend's field rules client-side for instant feedback
//      (authValidation.validateRegister) and bail before any request if they fail.
//   2. On a rejected request, an ApiError with a `field` (400 on a bad value, 409
//      on a taken username/email) attaches its message to that input; an error
//      without a field, or a non-ApiError transport failure, becomes the
//      form-level banner.
//
// useAuth().register throws on failure by design (AuthProvider does not catch it),
// which is what lets this handler read .field.
export function Register() {
  const { register } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [errors, setErrors] = useState<RegisterErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const found = validateRegister({ username, email, password, confirm });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await register({ username: username.trim(), email: email.trim(), password });
      // No navigate here: a successful register opens a session server-side and
      // flips the provider to 'authenticated'; AnonymousOnly (which wraps this
      // route) then redirects to '/'. This component unmounts with it.
    } catch (error) {
      if (isApiError(error) && error.field) {
        // 400 (bad value) or 409 (taken) — field is one of username/email/password.
        setErrors({ [error.field]: error.message });
      } else if (isApiError(error)) {
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Register</h1>
      <p className={styles.note}>
        Choose your username carefully — it is permanent and cannot be changed later. Your email is
        how you log in.
      </p>

      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
        {formError && (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        )}

        <TextField
          label="Username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={errors.username}
          autoComplete="username"
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoComplete="email"
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="new-password"
        />
        <TextField
          label="Confirm password"
          name="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
          autoComplete="new-password"
        />

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className={styles.alt}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </section>
  );
}
