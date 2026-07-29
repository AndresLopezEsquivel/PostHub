import { pool, closePool } from './pool';

// Seeds the categories lookup table — reference data the app needs to function
// (the Explore filter and the post form's multi-select both read it).
//
// Idempotent and production-safe: ON CONFLICT (slug) DO NOTHING means re-running
// never duplicates or overwrites. Adding a category later is just another row
// here plus a re-run. This does NOT touch user content — that's seed-dev.ts.

// name is the human label; slug is the URL form (/explore?category=<slug>).
const CATEGORIES: ReadonlyArray<{ name: string; slug: string }> = [
  { name: 'Philosophy', slug: 'philosophy' },
  { name: 'Fiction', slug: 'fiction' },
  { name: 'Technology', slug: 'technology' },
  { name: 'Science', slug: 'science' },
  { name: 'Art', slug: 'art' },
  { name: 'History', slug: 'history' },
  { name: 'Politics', slug: 'politics' },
  { name: 'Health', slug: 'health' },
  { name: 'Travel', slug: 'travel' },
  { name: 'Food', slug: 'food' },
];

async function seed(): Promise<void> {
  for (const { name, slug } of CATEGORIES) {
    await pool.query(
      `INSERT INTO categories (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO NOTHING`,
      [name, slug],
    );
  }

  const { rows } = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM categories',
  );
  console.log(`Categories seeded — ${rows[0].count} total.`);
}

seed()
  .then(() => closePool())
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exit(1);
  });
