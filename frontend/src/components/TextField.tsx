import { type InputHTMLAttributes, useId } from 'react';

import styles from './TextField.module.css';

// The labelled input every form uses.
//
// error is a string, so the same slot shows either a client-side validation
// message or the backend's 400/409 message. When set, the input gets
// aria-invalid and aria-describedby pointing at the message, which has
// role="alert" so screen readers announce it.
//
// Other props are passed to the <input>, so callers can add type,
// autoComplete, required and so on.
interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  value: string;
  onChange: InputHTMLAttributes<HTMLInputElement>['onChange'];
  error?: string;
}

export function TextField({ label, name, value, onChange, error, ...rest }: TextFieldProps) {
  // A stable, unique id per field instance so the label's htmlFor and the input's
  // aria-describedby line up even when the same field renders twice on a page.
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={styles.input}
        {...rest}
      />
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
