import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { type BookmarkState, bookmarkPost, unbookmarkPost } from '../api/bookmarks';
import { likePost, unlikePost } from '../api/likes';
import { useAuth } from '../auth/useAuth';

// Optimistic like and bookmark toggles for a post card or the detail page.
// State is local, with no shared cache: screens mount one at a time and
// refetch on mount, so the toggle only has to update the clicked element and
// roll back on error.
//
// Seeded once from the post's server values. A later refetch of the same post
// doesn't overwrite them, since the click is newer than the list it came from.

export interface Engageable {
  id: number;
  likeCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
}

// Bookmarks uses onBookmarkChange to remove a card once it's unbookmarked.
export function usePostToggles(
  post: Engageable,
  onBookmarkChange?: (state: BookmarkState) => void,
) {
  const { status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [bookmarked, setBookmarked] = useState(post.bookmarkedByMe);
  const [likePending, setLikePending] = useState(false);
  const [bookmarkPending, setBookmarkPending] = useState(false);

  // Anonymous users are sent to login with their current location, so they come
  // back after signing in.
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
      setLiked(state.likedByMe);
      setLikeCount(state.likeCount);
    } catch {
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
      onBookmarkChange?.(state);
    } catch {
      setBookmarked(prev);
    } finally {
      setBookmarkPending(false);
    }
  }

  return { liked, likeCount, bookmarked, likePending, bookmarkPending, toggleLike, toggleBookmark };
}
