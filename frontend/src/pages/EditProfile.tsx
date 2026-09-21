import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';

import { isApiError } from '../api/client';
import { getUserProfile, updateOwnProfile, type UpdateProfileInput } from '../api/users';
import { useAuth } from '../auth/useAuth';
import { ImageUploadField, type KeyIntent } from '../components/ImageUploadField';
import { TextField } from '../components/TextField';
import { useAsync } from '../hooks/useAsync';
import styles from './EditProfile.module.css';

// docs/screens.md §9 — Edit profile. Self only (RequireAuth). Fields: avatar, bio,
// email, and an optional new password + confirm. Username is NOT offered — it's
// immutable, and sending it is a 400 by design.
//
// Email is prefilled from the session (UserProfile carries no email); bio and avatar
// from the profile. A successful save refreshes the session so a changed email stays
// current.
export function EditProfile() {
  const { user } = useAuth();
  // RequireAuth guarantees a user; guard for the type.
  const username = user?.username ?? '';
  const profileState = useAsync((signal) => getUserProfile(username, signal), [username]);

  if (!user || profileState.status === 'loading') {
    return (
      <section className={styles.page}>
        <p role="status">Loading…</p>
      </section>
    );
  }

  if (profileState.status === 'error' || !profileState.data) {
    return (
      <section className={styles.page}>
        <div role="alert" className={styles.error}>
          <p>Could not load your profile.</p>
          <button type="button" onClick={profileState.reload}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Edit profile</h1>
      {/* Seeded once, so the form is mounted only after the data is in hand. */}
      <EditProfileForm
        initialBio={profileState.data.bio ?? ''}
        initialEmail={user.email}
        initialAvatarUrl={profileState.data.avatarUrl}
      />
    </section>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Field = 'bio' | 'email' | 'password' | 'confirm';
type FieldErrors = Partial<Record<Field, string>>;

function EditProfileForm({
  initialBio,
  initialEmail,
  initialAvatarUrl,
}: {
  initialBio: string;
  initialEmail: string;
  initialAvatarUrl: string | null;
}) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const [bio, setBio] = useState(initialBio);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [avatarIntent, setAvatarIntent] = useState<KeyIntent>({ kind: 'unchanged' });
  const [avatarPending, setAvatarPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    const e = email.trim();
    if (!e) found.email = 'Email is required';
    else if (e.length > 255 || !EMAIL_RE.test(e)) found.email = 'A valid email is required';
    // Password is optional; validate only if the user is setting one.
    if (password) {
      if (password.length < 8 || password.length > 72) {
        found.password = 'Password must be between 8 and 72 characters';
      } else if (confirm !== password) {
        found.confirm = 'Passwords do not match';
      }
    }
    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const body: UpdateProfileInput = { bio, email: email.trim() };
    if (password) body.password = password;
    // Only send avatarKey when it changed: a key sets it, null clears it; unchanged is
    // omitted so the stored avatar is preserved.
    if (avatarIntent.kind === 'set') body.avatarKey = avatarIntent.key;
    else if (avatarIntent.kind === 'removed') body.avatarKey = null;

    setSubmitting(true);
    try {
      await updateOwnProfile(body);
      // Keep the session's email current (used to prefill this form next time).
      await refresh();
      void navigate(`/users/${user?.username ?? ''}`);
    } catch (error) {
      if (isApiError(error) && error.field && ['bio', 'email', 'password'].includes(error.field)) {
        setErrors({ [error.field as Field]: error.message });
      } else if (isApiError(error)) {
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {formError && (
        <p role="alert" className={styles.formError}>
          {formError}
        </p>
      )}

      <ImageUploadField
        label="Avatar"
        purpose="avatar"
        initialUrl={initialAvatarUrl}
        onChange={setAvatarIntent}
        onPendingChange={setAvatarPending}
      />

      <div className={styles.field}>
        <label htmlFor="bio" className={styles.label}>
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className={styles.textarea}
        />
      </div>

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
        label="New password"
        name="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        autoComplete="new-password"
      />
      <TextField
        label="Confirm new password"
        name="confirm"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
        autoComplete="new-password"
      />
      <p className={styles.hint}>Leave the password fields blank to keep your current password.</p>

      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={submitting || avatarPending}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className={styles.cancel}
          disabled={submitting}
          onClick={() => void navigate(`/users/${user?.username ?? ''}`)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
