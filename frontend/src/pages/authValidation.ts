// Client-side validation for the two auth forms, transcribed field-for-field from
// backend/src/services/auth.service.ts's validateRegistration. It buys instant
// feedback before a round trip; it is NOT the authority. The backend re-validates
// every field and its 400/409 responses map back onto the same inputs as a
// backstop (see Register.tsx), so a drift here weakens the UX but never the rule.
//
// The regexes and bounds are copied from the backend on purpose — there is no
// shared package across the process boundary, exactly as the API types are
// transcribed rather than imported (see api/auth.ts). docs/api_design.md is the
// contract both sides answer to.

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegisterField = 'username' | 'email' | 'password' | 'confirm';
export type RegisterErrors = Partial<Record<RegisterField, string>>;

export interface RegisterFields {
  username: string;
  email: string;
  password: string;
  confirm: string;
}

// Returns the first problem per field (the backend stops at the first failure too,
// so matching that keeps the two messages consistent). An empty object means valid.
export function validateRegister(fields: RegisterFields): RegisterErrors {
  const username = fields.username.trim();
  const email = fields.email.trim();
  const errors: RegisterErrors = {};

  if (!username) {
    errors.username = 'Username is required';
  } else if (username.length < 3 || username.length > 30) {
    errors.username = 'Username must be between 3 and 30 characters';
  } else if (!USERNAME_RE.test(username)) {
    errors.username = 'Username may contain only letters, numbers, and underscores';
  }

  if (!email) {
    errors.email = 'Email is required';
  } else if (email.length > 255 || !EMAIL_RE.test(email)) {
    errors.email = 'A valid email is required';
  }

  if (!fields.password) {
    errors.password = 'Password is required';
  } else if (fields.password.length < 8 || fields.password.length > 72) {
    errors.password = 'Password must be between 8 and 72 characters';
  }

  // Confirm has no backend counterpart — the API takes one password. It exists
  // only to catch a typo before it becomes a password the user can't reproduce.
  if (!fields.confirm) {
    errors.confirm = 'Please re-enter your password';
  } else if (fields.password && fields.confirm !== fields.password) {
    errors.confirm = 'Passwords do not match';
  }

  return errors;
}

export type LoginField = 'email' | 'password';
export type LoginErrors = Partial<Record<LoginField, string>>;

export interface LoginFields {
  email: string;
  password: string;
}

// Login needs only presence checks: the backend does no format validation on the
// login path (authenticate() just looks up the email), and a wrong-but-well-formed
// credential is answered with a single 401 that reveals nothing. So the only thing
// worth stopping client-side is an empty submit.
export function validateLogin(fields: LoginFields): LoginErrors {
  const errors: LoginErrors = {};
  if (!fields.email.trim()) errors.email = 'Email is required';
  if (!fields.password) errors.password = 'Password is required';
  return errors;
}
