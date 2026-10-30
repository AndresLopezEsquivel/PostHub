import { pool, closePool } from './pool';

// Seeds the categories, which the app needs: the Explore filter and the post
// form both read them. Unlike seed-dev.ts, it touches no user content.
//
// Safe to re-run, including in production: ON CONFLICT (slug) DO NOTHING skips
// existing rows. A new entry here is added on the next run, but changing the
// name of an existing slug does not update the database.

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
