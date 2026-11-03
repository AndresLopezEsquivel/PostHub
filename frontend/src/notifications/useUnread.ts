import { useContext } from 'react';

import { UnreadContext } from './UnreadContext';

export function useUnread() {
  return useContext(UnreadContext);
}
