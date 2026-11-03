import bcrypt from 'bcryptjs';
import { queryOne } from '../db/query';
import { isUniqueViolation } from '../db/pgErrors';
import { UserRow } from '../types/db';
import { badRequest, conflict } from '../errors/httpError';

// No req or res here. The session is tied to the request, so the controller
// opens and closes it. Nothing this file returns includes password_hash.

const BCRYPT_COST = 10;

export interface PublicUser {
  username: string;
  email: string;
}

export function toPublicUser(row: UserRow): PublicUser {
  return { username: row.username, email: row.email };
}

// Compared against when no user matches, so a wrong email and a wrong
// password take the same time and login timing can't reveal which emails
// exist. The plaintext never matches a real password.
const DUMMY_HASH = bcrypt.hashSync('unused-timing-guard', BCRYPT_COST);

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterInput {
  username: unknown;
  email: unknown;
  password: unknown;
}

interface ValidRegistration {
  username: string;
  email: string;
  password: string;
}

// Bounds mirror the schema (username varchar(30), email varchar(255)). The
// password cap counts characters, but bcrypt only uses the first 72 bytes,
// so a password with multibyte characters is still truncated.
function validateRegistration(input: RegisterInput): ValidRegistration {
  const username = typeof input.username === 'string' ? input.username.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (!username) throw badRequest('Username is required', 'username');
  if (username.length < 3 || username.length > 30) {
    throw badRequest('Username must be between 3 and 30 characters', 'username');
  }
  if (!USERNAME_RE.test(username)) {
    throw badRequest('Username may contain only letters, numbers, and underscores', 'username');
  }

  if (!email) throw badRequest('Email is required', 'email');
  if (email.length > 255 || !EMAIL_RE.test(email)) {
    throw badRequest('A valid email is required', 'email');
  }

  if (!password) throw badRequest('Password is required', 'password');
  if (password.length < 8 || password.length > 72) {
    throw badRequest('Password must be between 8 and 72 characters', 'password');
  }

  return { username, email, password };
}

function constraintName(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null
    ? (err as { constraint?: string }).constraint
    : undefined;
}

// Uniqueness is left to the UNIQUE constraints, because a SELECT first would
// race the INSERT. The resulting 23505 becomes a 409 on the matching field.
export async function registerUser(input: RegisterInput): Promise<UserRow> {
  const { username, email, password } = validateRegistration(input);
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    const row = await queryOne<UserRow>(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [username, email, passwordHash],
    );
    // INSERT ... RETURNING always returns the row, so the assertion is safe.
    return row!;
  } catch (err) {
    if (isUniqueViolation(err)) {
      if (constraintName(err) === 'users_email_key') {
        throw conflict('Email already registered', 'email');
      }
      // Default to username: the only other UNIQUE constraint on the table.
      throw conflict('Username already taken', 'username');
    }
    throw err;
  }
}

// Returns null for an unknown email and for a wrong password alike, so the
// caller's single 401 doesn't reveal which was wrong. bcrypt.compare runs
// either way, which keeps the timing the same.
export async function authenticate(email: unknown, password: unknown): Promise<UserRow | null> {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const candidate = typeof password === 'string' ? password : '';

  const row = normalizedEmail
    ? await queryOne<UserRow>('SELECT * FROM users WHERE email = $1', [normalizedEmail])
    : null;

  const matches = await bcrypt.compare(candidate, row?.password_hash ?? DUMMY_HASH);
  return row && matches ? row : null;
}

export async function getUserById(id: number): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
}
