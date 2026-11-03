import { use } from 'react';

import { AuthContext, type AuthContextValue } from './AuthContext';

// Throws outside AuthProvider instead of returning a default: a silent default
// would make everyone look logged out instead of failing with a stack trace.
export function useAuth(): AuthContextValue {
  const value = use(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return value;
}
