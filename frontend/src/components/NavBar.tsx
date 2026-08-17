import { type FormEvent } from 'react';
import { createSearchParams, Link, NavLink, useNavigate, useSearchParams } from 'react-router';

import { useAuth } from '../auth/useAuth';
import styles from './NavBar.module.css';

// A global search box, present on every screen per docs/screens.md. It owns no
// results — submitting just navigates to Explore with ?search=, which Explore reads
// as the single source of that filter. Empty submit clears the search (→ '/').
//
// Uncontrolled, keyed on the active ?search value: the key remounts the input so
// its defaultValue re-syncs when the term changes elsewhere (e.g. Explore's "clear"
// button), without threading controlled state through the URL.
function SearchForm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const current = params.get('search') ?? '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = (new FormData(event.currentTarget).get('q') as string).trim();
    void navigate(value ? `/?${createSearchParams({ search: value })}` : '/');
  }

  return (
    <form role="search" className={styles.search} onSubmit={handleSubmit}>
      <input
        key={current}
        type="search"
        name="q"
        defaultValue={current}
        placeholder="Search posts…"
        aria-label="Search posts"
      />
    </form>
  );
}

// The navigation bar from docs/screens.md's "Cross-cutting surfaces". Two link
// sets, chosen by session state:
//
//   authenticated — logo · Explore · search · Feed · notifications · bookmarks ·
//                   create post · profile · logout
//   anonymous     — logo · Explore · search · Login · Register
//
// Deferred to later passes, deliberately: the unread badge on notifications
// (pass 8, fed by the unreadCount that rides in the notifications list envelope),
// and the avatar menu — the session response carries no avatar, and avatarUrl is
// stubbed null backend-side, so there is nothing to render yet.
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

        <SearchForm />

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
