import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { bookmarkPost, unbookmarkPost } from '../api/bookmarks';
import { likePost, unlikePost } from '../api/likes';
import { useAuth } from '../auth/useAuth';

// The optimistic like/bookmark toggle, shared by every place a post's engagement is
// interactive (the card on every list screen, and the detail page). Local state,
// deliberately no shared cache or data library: screens mount one at a time and each
// refetches on mount, so the only real requirement is optimistic-with-rollback on the
// element the user clicked — which is exactly this. (CLAUDE.md's pass-4 re-evaluation
// landed here: keep it local.)
//
// Seeded once from the post's server values. A later refetch of the same post id
// keeps the user's optimistic state rather than clobbering it — the right default,
// since the click is newer than any list the card sits in.

export interface Engageable {
  id: number;
  likeCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
}

export function usePostToggles(post: Engageable) {
  const { status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [bookmarked, setBookmarked] = useState(post.bookmarkedByMe);
  const [likePending, setLikePending] = useState(false);
  const [bookmarkPending, setBookmarkPending] = useState(false);

  // Engagement requires auth (screens.md §3). Anonymous → send them to login with
  // where they are, so they return after signing in. Returns false to stop the toggle.
  function ensureAuthed(): boolean {
    if (status !== 'authenticated') {
      void navigate('/login', { state: { from: location } });
      return false;
    }
    return true;
  }

  async function toggleLike() {
    if (!ensureAuthed() || likePending) return;
    const prevLiked = liked;
    const prevCount = likeCount;
    const next = !prevLiked;

    setLiked(next);
    setLikeCount(prevCount + (next ? 1 : -1));
    setLikePending(true);
    try {
      const state = next ? await likePost(post.id) : await unlikePost(post.id);
      // Reconcile with the authoritative count/state.
      setLiked(state.likedByMe);
      setLikeCount(state.likeCount);
    } catch {
      // Roll back to the pre-click values captured above.
      setLiked(prevLiked);
      setLikeCount(prevCount);
    } finally {
      setLikePending(false);
    }
  }

  async function toggleBookmark() {
    if (!ensureAuthed() || bookmarkPending) return;
    const prev = bookmarked;
    const next = !prev;

    setBookmarked(next);
    setBookmarkPending(true);
    try {
      const state = next ? await bookmarkPost(post.id) : await unbookmarkPost(post.id);
      setBookmarked(state.bookmarkedByMe);
    } catch {
      setBookmarked(prev);
    } finally {
      setBookmarkPending(false);
    }
  }

  return { liked, likeCount, bookmarked, likePending, bookmarkPending, toggleLike, toggleBookmark };
}
