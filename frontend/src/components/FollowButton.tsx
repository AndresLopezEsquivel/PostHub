import type { FollowState } from '../api/users';
import { useFollowToggle } from '../hooks/useFollowToggle';
import styles from './FollowButton.module.css';

// Used on Profile and in follower lists; the state lives in useFollowToggle.
// aria-pressed shows whether you follow, and the aria-label stays "Follow".
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
