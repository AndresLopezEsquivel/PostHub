import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { listNotifications } from '../api/notifications';
import { useAuth } from '../auth/useAuth';
import { UnreadContext, type UnreadContextValue } from './UnreadContext';

// Holds the unread-notifications count for the nav badge. Fetches it once when the
// session becomes authenticated — reusing GET /api/notifications (limit 1), whose
// envelope carries unreadCount, so there is no separate count endpoint. The
// Notifications screen pushes updates here as the user reads.
//
// Mounted in main.tsx inside AuthProvider (it needs the session) and outside the
// router (the badge lives in the nav on every screen).
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (status !== 'authenticated') {
      // Logged out (or still probing): no badge.
      setUnreadCount(0);
      return;
    }

    // Same stale-guard as AuthProvider's probe. Errors are swallowed — a failed count
    // fetch should leave the badge at 0, never surface as an app error.
    const controller = new AbortController();
    listNotifications({ limit: 1 }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setUnreadCount(res.unreadCount);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [status]);

  const value = useMemo<UnreadContextValue>(
    () => ({ unreadCount, setUnreadCount }),
    [unreadCount],
  );

  return <UnreadContext value={value}>{children}</UnreadContext>;
}
