import { use } from 'react';

import { AuthContext, type AuthContextValue } from './AuthContext';

// The only supported way to read auth state. Throws rather than returning a
// default, because a component rendering outside AuthProvider is a wiring bug and
// a silent default would turn it into a subtle "everyone looks logged out" bug
// instead of a stack trace.
export function useAuth(): AuthContextValue {
  const value = use(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return value;
}
