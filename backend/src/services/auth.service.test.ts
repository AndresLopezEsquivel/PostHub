import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { HttpError } from '../errors/httpError';

// Unit test: no database. The db/query helper and bcryptjs are mocked so the
// service's logic — validation, the row→PublicUser mapping, and the 23505→409
// constraint mapping — is exercised without hashing or connecting.
vi.mock('../db/query', () => ({
  queryOne: vi.fn(),
}));
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async () => 'hashed-pw'),
    hashSync: vi.fn(() => 'dummy-hash'), // used for DUMMY_HASH at import time
    compare: vi.fn(),
  },
}));

import bcrypt from 'bcryptjs';
import { queryOne } from '../db/query';
import {
  toPublicUser,
  registerUser,
  authenticate,
  getUserById,
} from './auth.service';
import { UserRow } from '../types/db';

const mockQueryOne = queryOne as unknown as Mock;
const mockHash = bcrypt.hash as unknown as Mock;
const mockCompare = bcrypt.compare as unknown as Mock;

const sampleRow: UserRow = {
  id: 7,
  username: 'neo',
  email: 'neo@example.com',
  password_hash: 'stored-hash',
  bio: null,
  avatar_key: null,
  created_at: '2026-07-29T00:00:00Z',
  updated_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockHash.mockResolvedValue('hashed-pw');
});

describe('toPublicUser', () => {
  it('exposes only username and email — never password_hash', () => {
    const result = toPublicUser(sampleRow);
    expect(result).toEqual({ username: 'neo', email: 'neo@example.com' });
    expect(result).not.toHaveProperty('password_hash');
  });
});

describe('registerUser validation', () => {
  const valid = { username: 'neo', email: 'neo@example.com', password: 'trinity123' };

  it.each([
    ['missing username', { ...valid, username: '' }, 'username'],
    ['too-short username', { ...valid, username: 'ab' }, 'username'],
    ['invalid username chars', { ...valid, username: 'has space' }, 'username'],
    ['missing email', { ...valid, email: '' }, 'email'],
    ['malformed email', { ...valid, email: 'not-an-email' }, 'email'],
    ['missing password', { ...valid, password: '' }, 'password'],
    ['too-short password', { ...valid, password: 'short' }, 'password'],
  ])('rejects %s with a 400 on the right field', async (_label, input, field) => {
    await expect(registerUser(input)).rejects.toMatchObject({
      status: 400,
      field,
    });
    await expect(registerUser(input)).rejects.toBeInstanceOf(HttpError);
    // Validation fails before any hashing or DB write.
    expect(mockQueryOne).not.toHaveBeenCalled();
  });
});

describe('registerUser', () => {
  it('hashes the password and returns the inserted row', async () => {
    mockQueryOne.mockResolvedValue(sampleRow);

    const row = await registerUser({
      username: 'neo',
      email: 'Neo@Example.com',
      password: 'trinity123',
    });

    expect(mockHash).toHaveBeenCalledWith('trinity123', 10);
    // email is normalized to lowercase before insert.
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), [
      'neo',
      'neo@example.com',
      'hashed-pw',
    ]);
    expect(row).toBe(sampleRow);
  });

  it('maps a duplicate-username unique violation to 409 on username', async () => {
    mockQueryOne.mockRejectedValue({ code: '23505', constraint: 'users_username_key' });

    await expect(
      registerUser({ username: 'neo', email: 'neo@example.com', password: 'trinity123' }),
    ).rejects.toMatchObject({ status: 409, field: 'username' });
  });

  it('maps a duplicate-email unique violation to 409 on email', async () => {
    mockQueryOne.mockRejectedValue({ code: '23505', constraint: 'users_email_key' });

    await expect(
      registerUser({ username: 'neo', email: 'neo@example.com', password: 'trinity123' }),
    ).rejects.toMatchObject({ status: 409, field: 'email' });
  });

  it('re-throws a non-unique DB error unchanged (becomes a 500 upstream)', async () => {
    const boom = new Error('connection reset');
    mockQueryOne.mockRejectedValue(boom);

    await expect(
      registerUser({ username: 'neo', email: 'neo@example.com', password: 'trinity123' }),
    ).rejects.toBe(boom);
  });
});

describe('authenticate', () => {
  it('returns the row when the email exists and the password matches', async () => {
    mockQueryOne.mockResolvedValue(sampleRow);
    mockCompare.mockResolvedValue(true);

    await expect(authenticate('neo@example.com', 'trinity123')).resolves.toBe(sampleRow);
    expect(mockCompare).toHaveBeenCalledWith('trinity123', 'stored-hash');
  });

  it('returns null when the password does not match', async () => {
    mockQueryOne.mockResolvedValue(sampleRow);
    mockCompare.mockResolvedValue(false);

    await expect(authenticate('neo@example.com', 'wrong')).resolves.toBeNull();
  });

  it('returns null for an unknown email but still runs a compare (timing guard)', async () => {
    mockQueryOne.mockResolvedValue(null);
    mockCompare.mockResolvedValue(false);

    await expect(authenticate('ghost@example.com', 'whatever')).resolves.toBeNull();
    // Compared against the dummy hash so a missing user costs the same time.
    expect(mockCompare).toHaveBeenCalledWith('whatever', 'dummy-hash');
  });
});

describe('getUserById', () => {
  it('looks the user up by id', async () => {
    mockQueryOne.mockResolvedValue(sampleRow);

    await expect(getUserById(7)).resolves.toBe(sampleRow);
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [7]);
  });
});
