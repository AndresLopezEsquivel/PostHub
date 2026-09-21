import { useContext } from 'react';

import { UnreadContext } from './UnreadContext';

// Read the shared unread count. No throw-if-outside-provider (unlike useAuth): the
// context has a safe non-null default, because a missing provider means "no badge",
// not a broken app.
export function useUnread() {
  return useContext(UnreadContext);
}
