import { type FormEvent, type ReactNode, useState } from 'react';

import type { Category } from '../api/categories';
import { isApiError } from '../api/client';
import { ImageUploadField, type KeyIntent } from './ImageUploadField';
import { TextField } from './TextField';
import styles from './PostForm.module.css';

export interface PostFormValues {
  title: string;
  content: string;
  categoryIds: number[];
  // Only present when the image changed: a key sets it and null removes it.
  // Left out when unchanged, so a PATCH keeps the stored image.
  imageKey?: string | null;
}

type FieldErrors = Partial<Record<'title' | 'content' | 'categoryIds', string>>;

const TITLE_MAX = 200; // posts.title varchar(200)
const FIELD_KEYS = ['title', 'content', 'categoryIds'] as const;

function isFieldKey(field: string): field is (typeof FIELD_KEYS)[number] {
  return (FIELD_KEYS as readonly string[]).includes(field);
}

// The create and edit form, shared by CreatePost and EditPost. It owns the
// field state, client-side validation that mirrors the backend, and showing
// an ApiError's field next to its input. The caller loads the data and
// decides what happens after submit. Extra actions, like EditPost's Delete,
// are passed as children.
export function PostForm({
  categories,
  initial,
  imageInitialUrl,
  submitLabel,
  onSubmit,
  onCancel,
  children,
}: {
  categories: Category[];
  initial?: PostFormValues;
  imageInitialUrl?: string | null;
  submitLabel: string;
  onSubmit: (values: PostFormValues) => Promise<void>;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [selected, setSelected] = useState<Set<number>>(new Set(initial?.categoryIds ?? []));
  const [imageIntent, setImageIntent] = useState<KeyIntent>({ kind: 'unchanged' });
  const [imagePending, setImagePending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleCategory(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    const t = title.trim();
    if (!t) found.title = 'Title is required';
    else if (t.length > TITLE_MAX) found.title = `Title must be at most ${TITLE_MAX} characters`;
    if (!content.trim()) found.content = 'Content is required';
    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const values: PostFormValues = {
      title: title.trim(),
      content: content.trim(),
      categoryIds: [...selected],
    };
    if (imageIntent.kind === 'set') values.imageKey = imageIntent.key;
    else if (imageIntent.kind === 'removed') values.imageKey = null;

    setSubmitting(true);
    try {
      await onSubmit(values);
      // On success the caller navigates away; this component unmounts with it.
    } catch (error) {
      if (isApiError(error) && error.field && isFieldKey(error.field)) {
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
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {formError && (
        <p role="alert" className={styles.formError}>
          {formError}
        </p>
      )}

      <TextField
        label="Title"
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
      />

      <div className={styles.field}>
        <label htmlFor="post-content" className={styles.label}>
          Body
        </label>
        <textarea
          id="post-content"
          name="content"
          rows={10}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          aria-invalid={errors.content ? true : undefined}
          className={styles.textarea}
        />
        {errors.content && (
          <p role="alert" className={styles.error}>
            {errors.content}
          </p>
        )}
      </div>

      <fieldset className={styles.categories}>
        <legend className={styles.label}>Categories</legend>
        <div className={styles.checkboxes}>
          {categories.map((category) => (
            <label key={category.id} className={styles.checkbox}>
              <input
                type="checkbox"
                checked={selected.has(category.id)}
                onChange={() => toggleCategory(category.id)}
              />
              {category.name}
            </label>
          ))}
        </div>
        {errors.categoryIds && (
          <p role="alert" className={styles.error}>
            {errors.categoryIds}
          </p>
        )}
      </fieldset>

      <ImageUploadField
        label="Image"
        purpose="post"
        initialUrl={imageInitialUrl}
        onChange={setImageIntent}
        onPendingChange={setImagePending}
      />

      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={submitting || imagePending}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        {children}
      </div>
    </form>
  );
}
