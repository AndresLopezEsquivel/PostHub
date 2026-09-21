import { type InputHTMLAttributes, useId } from 'react';

import styles from './TextField.module.css';

// The one labelled-input primitive every form in the app builds on. Its whole job
// is the pattern pass 1 exists to establish: a field that can render the message
// carried by an ApiError.field, wired for assistive tech.
//
// `error` is a string, not a boolean: the same slot shows a client-side validation
// message (mirrored from the backend's own rules) or the backend's own 400/409
// message, so a caller never has to decide which. When it is set, the input is
// marked aria-invalid and pointed at the message via aria-describedby, and the
// message is a role="alert" so a screen reader announces it on appearance.
//
// It forwards ...rest to the <input>, so a caller adds type, autoComplete,
// minLength, required, etc. without this component enumerating them.
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
