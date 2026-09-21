import { type ChangeEvent, useEffect, useRef, useState } from 'react';

import { isApiError } from '../api/client';
import { type Purpose, uploadImage } from '../api/uploads';
import styles from './ImageUploadField.module.css';

// The shared image picker for both forms (post image, profile avatar). It owns the
// whole upload lifecycle and uploads ON SELECT (immediate), so by submit time the
// parent already holds the object key. It reports its result up as a KeyIntent so the
// parent can distinguish the three cases a PATCH must handle: leave the field alone
// (omit → preserve the stored key), set a new key, or clear it. While an upload is in
// flight it reports pending so the parent can disable submit.

export type KeyIntent =
  | { kind: 'unchanged' }
  | { kind: 'set'; key: string }
  | { kind: 'removed' };

export function ImageUploadField({
  label,
  purpose,
  initialUrl,
  onChange,
  onPendingChange,
}: {
  label: string;
  purpose: Purpose;
  initialUrl?: string | null;
  onChange: (intent: KeyIntent) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  // mode drives what the preview shows: the existing image, a freshly picked one, or
  // nothing (removed). objectUrl is the blob: preview for a new pick, revoked on replace.
  const [mode, setMode] = useState<'initial' | 'new' | 'removed'>('initial');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke the last blob URL when it's replaced or the component unmounts.
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const previewUrl = mode === 'new' ? objectUrl : mode === 'removed' ? null : (initialUrl ?? null);

  function setPending(pending: boolean) {
    setUploading(pending);
    onPendingChange?.(pending);
  }

  async function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);

    // Show the picked file immediately, even while it uploads.
    const nextUrl = URL.createObjectURL(file);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(nextUrl);
    setMode('new');
    setPending(true);

    try {
      const key = await uploadImage(file, purpose);
      onChange({ kind: 'set', key });
    } catch (err) {
      // Discard the failed pick: revoke the preview, fall back to whatever was shown
      // before, and leave the parent's intent untouched (onChange not called).
      URL.revokeObjectURL(nextUrl);
      setObjectUrl(null);
      setMode(initialUrl ? 'initial' : 'removed');
      setError(isApiError(err) ? err.message : 'Upload failed. Please try again.');
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setPending(false);
    }
  }

  function handleRemove() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    setMode('removed');
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
    onChange({ kind: 'removed' });
  }

  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>

      {previewUrl && (
        <img className={styles.preview} src={previewUrl} alt={`${label} preview`} />
      )}

      <div className={styles.controls}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleSelect}
          disabled={uploading}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          className={styles.input}
        />
        {previewUrl && !uploading && (
          <button type="button" className={styles.remove} onClick={handleRemove}>
            Remove
          </button>
        )}
      </div>

      {uploading && (
        <p role="status" className={styles.status}>
          Uploading…
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
