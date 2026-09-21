import { createContext } from 'react';

// The unread-notifications count, shared between the nav badge (on every
// authenticated screen) and the Notifications screen (which updates it as the user
// reads). Genuinely cross-component and single-valued — the one piece of shared
// state this feature needs, justified the same way AuthContext is.
export interface UnreadContextValue {
  unreadCount: number;
  setUnreadCount(n: number): void;
}

// Unlike AuthContext, the default here is NON-null (a no-op). A component reading it
// outside the provider is not a bug worth crashing over — the badge is cosmetic, not
// a gate — so NavBar renders fine without a provider (e.g. in tests that don't mount
// one), just showing no badge.
export const UnreadContext = createContext<UnreadContextValue>({
  unreadCount: 0,
  setUnreadCount: () => {},
});
