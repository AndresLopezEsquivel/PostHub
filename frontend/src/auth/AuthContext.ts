import { createContext } from 'react';

import type { LoginInput, PublicUser, RegisterInput } from '../api/auth';

// Kept apart from AuthProvider.tsx so useAuth and the guards can import the
// context without pulling in the provider.

// Three states, not a boolean: 'loading' stops RequireAuth from redirecting
// while the session check is still running. With a boolean, a logged-in user
// who reloads a deep link would be sent to /login and lose their place.
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  // Checks the session again. The session has the email but UserProfile
  // doesn't, so Edit profile calls this after an email change to keep
  // user.email current.
  refresh(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
