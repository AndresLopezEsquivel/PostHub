import { useState } from 'react';

import styles from './Avatar.module.css';

// Used everywhere a user is shown, so size, alt text and the fallback stay
// consistent. Without a url, or when the image fails to load, it shows the
// name's first letter in a circle.

const SIZES = { sm: styles.sm, md: styles.md, lg: styles.lg } as const;

export function Avatar({
  url,
  name,
  size = 'sm',
}: {
  url: string | null | undefined;
  name: string;
  size?: keyof typeof SIZES;
}) {
  const [broken, setBroken] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const className = `${styles.avatar} ${SIZES[size]}`;

  if (!url || broken) {
    return (
      <span className={className} aria-hidden="true" data-placeholder="true">
        {initial}
      </span>
    );
  }

  return (
    <img
      className={className}
      src={url}
      alt={`${name}'s avatar`}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
