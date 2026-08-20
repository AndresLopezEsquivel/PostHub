import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { query } from '../../src/db/query';
import { seedCategories } from '../helpers/db';

// GET /api/categories — read-only reference data, no auth, unpaginated.
// NOTE: categories is reference data, so resetDb() in beforeEach deliberately
// does NOT truncate it (unlike the domain tables). Each test here therefore
// sets up the exact category set it asserts on — seeding it, or clearing it.
describe('GET /api/categories', () => {
  it('returns the seeded categories as a plain array in name order', async () => {
    await seedCategories(); // Philosophy, Fiction, Technology

    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    // A plain array, not a { data, ... } pagination envelope.
    expect(Array.isArray(res.body)).toBe(true);
    // Ordered by name ascending: Fiction, Philosophy, Technology.
    expect(res.body).toEqual([
      { id: expect.any(Number), name: 'Fiction', slug: 'fiction' },
      { id: expect.any(Number), name: 'Philosophy', slug: 'philosophy' },
      { id: expect.any(Number), name: 'Technology', slug: 'technology' },
    ]);
  });

  it('returns an empty array when no categories exist', async () => {
    // resetDb() leaves reference data intact, so clear it explicitly here.
    await query('TRUNCATE categories RESTART IDENTITY CASCADE');

    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
