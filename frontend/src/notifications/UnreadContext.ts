import { createContext } from 'react';

// Shared between the nav badge and the Notifications screen, which updates it
// as the user reads.
export interface UnreadContextValue {
  unreadCount: number;
  setUnreadCount(n: number): void;
}

// A no-op default, unlike AuthContext: the badge is cosmetic, so without a
// provider NavBar just shows no badge instead of crashing.
export const UnreadContext = createContext<UnreadContextValue>({
  unreadCount: 0,
  setUnreadCount: () => {},
});
