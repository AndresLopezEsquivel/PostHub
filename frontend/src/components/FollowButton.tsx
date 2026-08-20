import type { FollowState } from '../api/users';
import { useFollowToggle } from '../hooks/useFollowToggle';
import styles from './FollowButton.module.css';

// The follow/unfollow control, used on Profile and on every followers/following row.
// State lives in useFollowToggle; this is just the button. aria-pressed conveys the
// followed state (stable aria-label "Follow"). The count is public; the click gates
// on auth (the hook redirects an anonymous visitor to login).
export function FollowButton({
  username,
  initialFollowing,
  onChange,
}: {
  username: string;
  initialFollowing: boolean;
  onChange?: (state: FollowState) => void;
}) {
  const { following, pending, toggle } = useFollowToggle(username, initialFollowing, onChange);

  return (
    <button
      type="button"
      className={styles.button}
      aria-label="Follow"
      aria-pressed={following}
      disabled={pending}
      onClick={() => void toggle()}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
