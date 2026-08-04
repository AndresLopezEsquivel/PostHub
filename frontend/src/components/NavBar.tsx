import { Link, NavLink, useNavigate } from 'react-router';

import { useAuth } from '../auth/useAuth';
import styles from './NavBar.module.css';

// The navigation bar from docs/screens.md's "Cross-cutting surfaces". Two link
// sets, chosen by session state:
//
//   authenticated — logo · Feed · Explore · notifications · profile · bookmarks ·
//                   create post · logout
//   anonymous     — logo · Explore · Login · Register
//
// Deferred to later passes, deliberately: the search box (pass 2, when Explore
// can receive ?search=), the unread badge on notifications (pass 8, fed by the
// unreadCount that rides in the notifications list envelope), and the avatar
// menu — the session response carries no avatar, and avatarUrl is stubbed null
// backend-side, so there is nothing to render yet.
export function NavBar() {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    // Leave whatever gated screen we were on. Without this, logging out of
    // /bookmarks leaves RequireAuth to redirect, which works but reads as a
    // bounce rather than a deliberate exit.
    void navigate('/');
  }

  return (
    <header className={styles.bar}>
      <Link to="/" className={styles.logo}>
        PostHub
      </Link>

      <nav className={styles.links}>
        <NavLink to="/">Explore</NavLink>

        {/* 'loading' renders neither set. Showing the anonymous links while the
            session probe is in flight would flash "Login" at someone who is
            already signed in — the same reasoning as the guards' loading hold. */}
        {status === 'authenticated' && user && (
          <>
            <NavLink to="/feed">Feed</NavLink>
            <NavLink to="/notifications">Notifications</NavLink>
            <NavLink to="/bookmarks">Bookmarks</NavLink>
            <NavLink to="/posts/new">Create post</NavLink>
            <NavLink to={`/users/${user.username}`}>{user.username}</NavLink>
            <button type="button" onClick={() => void handleLogout()}>
              Log out
            </button>
          </>
        )}

        {status === 'anonymous' && (
          <>
            <NavLink to="/login">Log in</NavLink>
            <NavLink to="/register">Register</NavLink>
          </>
        )}
      </nav>
    </header>
  );
}
