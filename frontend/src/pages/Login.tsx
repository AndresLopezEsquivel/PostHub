import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';

import { isApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { TextField } from '../components/TextField';
import styles from './AuthForm.module.css';
import { validateLogin, type LoginErrors } from './authValidation';

// A wrong email and a wrong password both get one 401 "Invalid credentials"
// with no field, so nobody can tell which accounts exist. That error is always
// shown at form level.
export function Login() {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const found = validateLogin({ email, password });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      // No navigate: AnonymousOnly does the redirect once the status changes.
    } catch (error) {
      // 401 carries no field, so it always lands here; a non-ApiError is a
      // transport failure.
      setFormError(
        isApiError(error) ? error.message : 'Something went wrong. Please try again.',
      );
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Log in</h1>

      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
        {formError && (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        )}

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
          autoComplete="current-password"
        />

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className={styles.alt}>
        Need an account? <Link to="/register">Register</Link>
      </p>
    </section>
  );
}
