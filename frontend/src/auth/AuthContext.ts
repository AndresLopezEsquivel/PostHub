import { createContext } from 'react';

import type { LoginInput, PublicUser, RegisterInput } from '../api/auth';

// Split from AuthProvider.tsx because this file holds no JSX: the context object
// and its types are imported by useAuth and by both guards, and keeping them in a
// .ts module means those importers don't pull the provider's implementation
// along with them.

// Three states, not a boolean — the single most important decision in the shell.
// 'loading' is what stops RequireAuth from redirecting while the session probe is
// still in flight. With a boolean, every authenticated user who hard-refreshes a
// deep link gets bounced to /login for one tick and loses their destination.
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
}

// No default value. A component reading this outside the provider is a wiring
// bug, and useAuth throws rather than handing back a silently inert object.
export const AuthContext = createContext<AuthContextValue | null>(null);
