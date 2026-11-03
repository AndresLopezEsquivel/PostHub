import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { listNotifications } from '../api/notifications';
import { useAuth } from '../auth/useAuth';
import { UnreadContext, type UnreadContextValue } from './UnreadContext';

// Fetches the count once the session is authenticated, using
// GET /api/notifications with limit 1, whose envelope includes unreadCount.
// The Notifications screen updates it as the user reads.
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (status !== 'authenticated') {
      // Logged out or still checking: no badge.
      setUnreadCount(0);
      return;
    }

    // A failed fetch leaves the badge at 0 instead of showing an app error.
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
