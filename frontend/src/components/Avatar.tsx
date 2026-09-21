import { useState } from 'react';

import styles from './Avatar.module.css';

// One presentational avatar, reused everywhere a user is shown (post cards, post
// detail, profile, follow lists, comments) so size, alt text, and the no-image
// fallback stay consistent. Renders the image when a url is present and loads; falls
// back to a neutral circle with the name's first initial otherwise — including when a
// broken src fails to load (onError). Purely presentational: no data fetching.

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
