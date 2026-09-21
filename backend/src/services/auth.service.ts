import bcrypt from 'bcryptjs';
import { queryOne } from '../db/query';
import { isUniqueViolation } from '../db/pgErrors';
import { UserRow } from '../types/db';
import { badRequest, conflict } from '../errors/httpError';

// Auth data access + validation + row→API mapping. No req/res, no session: the
// session is request-bound, so opening/closing it lives in the controller. This
// layer hashes, reads, and validates — and never returns password_hash.

const BCRYPT_COST = 10; // matches seed-dev.ts, so seeded users log in too

// The public shape for a user in auth responses. Never includes password_hash.
export interface PublicUser {
  username: string;
  email: string;
}

export function toPublicUser(row: UserRow): PublicUser {
  return { username: row.username, email: row.email };
}

// A precomputed hash to compare against when no user matches, so a wrong email
// and a wrong password cost the same time — no login-timing user-enumeration
// oracle. The plaintext is irrelevant; it will never match a real password.
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

// Presence + shape checks, throwing badRequest(…, field) on the first failure.
// Bounds mirror the schema (username varchar(30)); the password floor is a
// policy minimum, capped at bcrypt's 72-byte effective limit.
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

// Read the constraint name off a caught pg error, to attribute a unique-violation
// to the right field (username vs. email).
function constraintName(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null
    ? (err as { constraint?: string }).constraint
    : undefined;
}

// Create the user and return the stored row. Uniqueness is enforced by the DB
// (username/email UNIQUE); we catch the 23505 and map it to a 409 on the right
// field rather than pre-checking with a SELECT that would race the INSERT.
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
    // queryOne can be null in general, but INSERT ... RETURNING always yields the
    // row it just wrote; assert it for the type.
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

// Verify credentials. Returns the row on success, null on any failure (unknown
// email or wrong password) — the caller maps null to a single 401 that does not
// reveal which half was wrong. Always runs a bcrypt.compare so timing is uniform.
export async function authenticate(email: unknown, password: unknown): Promise<UserRow | null> {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const candidate = typeof password === 'string' ? password : '';

  const row = normalizedEmail
    ? await queryOne<UserRow>('SELECT * FROM users WHERE email = $1', [normalizedEmail])
    : null;

  const matches = await bcrypt.compare(candidate, row?.password_hash ?? DUMMY_HASH);
  return row && matches ? row : null;
}

// Load the session user for GET /api/auth/session.
export async function getUserById(id: number): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
}
