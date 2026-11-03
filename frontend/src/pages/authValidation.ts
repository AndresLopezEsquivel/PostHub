// Client-side copies of the rules in validateRegistration
// (backend/src/services/auth.service.ts), for feedback without a round trip.
// The backend still checks every field, and Register.tsx shows its 400 and 409
// errors on the same inputs, so if these drift only the feedback suffers.
//
// The regexes and limits are copied, not imported: the frontend and backend
// share no package, just as the API types in api/auth.ts are copied.

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

  // Confirm has no backend counterpart: the API takes one password. It catches
  // a typo before it becomes a password the user can't repeat.
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
