import bcrypt from 'bcryptjs';
import { pool, closePool } from './pool';
import { withTransaction } from './query';

// DEVELOPMENT sample data. Wipes the domain tables and inserts a small, known
// graph of users/posts/comments/likes/bookmarks/follows so the schema can be
// exercised — cascades, composite-PK dedup, the self-follow CHECK — before any
// controller exists. Categories are preserved (they're reference data).
//
// DESTRUCTIVE. Refuses to run when NODE_ENV=production so it can never truncate
// a real database.

const DEV_PASSWORD = 'password123'; // throwaway; every seeded user shares it

async function seedDev(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed:dev is destructive and refuses to run in production.');
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  await withTransaction(async (tx) => {
    // RESTART IDENTITY resets the serial sequences so ids are predictable (the
    // first user is always 1). CASCADE clears the FK-dependent rows. categories
    // is intentionally absent — reference data survives.
    await tx.query(`
      TRUNCATE users, posts, comments, post_likes, bookmarks, follows,
               notifications, post_categories
      RESTART IDENTITY CASCADE
    `);

    // Categories are normally seeded by `npm run seed`; make sure they exist so
    // seed:dev works standalone. Idempotent.
    const categorySeed: ReadonlyArray<[string, string]> = [
      ['Philosophy', 'philosophy'],
      ['Fiction', 'fiction'],
      ['Technology', 'technology'],
      ['Science', 'science'],
    ];
    for (const [name, slug] of categorySeed) {
      await tx.query(
        `INSERT INTO categories (name, slug) VALUES ($1, $2)
         ON CONFLICT (slug) DO NOTHING`,
        [name, slug],
      );
    }
    const categoryId = new Map<string, number>();
    for (const { id, slug } of (
      await tx.query<{ id: number; slug: string }>(
        'SELECT id, slug FROM categories',
      )
    ).rows) {
      categoryId.set(slug, id);
    }

    // --- users (ids 1..3) ---
    const users: ReadonlyArray<{ username: string; email: string; bio: string }> = [
      { username: 'andres', email: 'andres@example.com', bio: 'Writes about absurdism.' },
      { username: 'mira', email: 'mira@example.com', bio: 'Fiction and long walks.' },
      { username: 'devon', email: 'devon@example.com', bio: 'Tinkering with databases.' },
    ];
    const userId = new Map<string, number>();
    for (const u of users) {
      const { rows } = await tx.query<{ id: number }>(
        `INSERT INTO users (username, email, password_hash, bio)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [u.username, u.email, passwordHash, u.bio],
      );
      userId.set(u.username, rows[0].id);
    }

    // --- posts (ids 1..5) ---
    const posts: ReadonlyArray<{
      author: string;
      title: string;
      content: string;
      categories: string[];
    }> = [
      {
        author: 'andres',
        title: 'On absurdism',
        content: 'Camus opens with the one truly serious philosophical problem…',
        categories: ['philosophy'],
      },
      {
        author: 'andres',
        title: 'The myth, revisited',
        content: 'Returning to Sisyphus after a decade, the rock feels lighter…',
        categories: ['philosophy', 'fiction'],
      },
      {
        author: 'mira',
        title: 'A short story about rain',
        content: 'It had not stopped for three days when she found the letter…',
        categories: ['fiction'],
      },
      {
        author: 'devon',
        title: 'Composite keys earn their keep',
        content: 'A join table with the pair as its identity turns "did I?" into a PK lookup…',
        categories: ['technology', 'science'],
      },
      {
        author: 'devon',
        title: 'Why COUNT beats a counter column',
        content: 'Denormalized counters drift. Correctness before performance…',
        categories: ['technology'],
      },
    ];
    const postId = new Map<string, number>(); // title → id
    for (const p of posts) {
      const { rows } = await tx.query<{ id: number }>(
        `INSERT INTO posts (author_id, title, content)
         VALUES ($1, $2, $3) RETURNING id`,
        [userId.get(p.author), p.title, p.content],
      );
      const id = rows[0].id;
      postId.set(p.title, id);
      for (const slug of p.categories) {
        await tx.query(
          'INSERT INTO post_categories (post_id, category_id) VALUES ($1, $2)',
          [id, categoryId.get(slug)],
        );
      }
    }

    // --- comments ---
    const comments: ReadonlyArray<[string, string, string]> = [
      // [commenter, post title, content]
      ['mira', 'On absurdism', 'Great read — the opening lands hard.'],
      ['devon', 'On absurdism', 'The rock as routine is the part that stuck with me.'],
      ['andres', 'A short story about rain', 'That last line. Wow.'],
    ];
    for (const [commenter, title, content] of comments) {
      await tx.query(
        'INSERT INTO comments (post_id, author_id, content) VALUES ($1, $2, $3)',
        [postId.get(title), userId.get(commenter), content],
      );
    }

    // --- likes (composite PK enforces one per user per post) ---
    const likes: ReadonlyArray<[string, string]> = [
      ['mira', 'On absurdism'],
      ['devon', 'On absurdism'],
      ['andres', 'Composite keys earn their keep'],
      ['mira', 'Composite keys earn their keep'],
    ];
    for (const [liker, title] of likes) {
      await tx.query(
        'INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)',
        [userId.get(liker), postId.get(title)],
      );
    }

    // --- bookmarks (private) ---
    const bookmarks: ReadonlyArray<[string, string]> = [
      ['andres', 'A short story about rain'],
      ['mira', 'The myth, revisited'],
    ];
    for (const [saver, title] of bookmarks) {
      await tx.query(
        'INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2)',
        [userId.get(saver), postId.get(title)],
      );
    }

    // --- follows (directional; andres↔mira is the mutual pair) ---
    const follows: ReadonlyArray<[string, string]> = [
      ['andres', 'mira'],
      ['mira', 'andres'],
      ['devon', 'andres'],
    ];
    for (const [follower, followee] of follows) {
      await tx.query(
        'INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)',
        [userId.get(follower), userId.get(followee)],
      );
    }
  });

  console.log(
    'Dev data seeded — 3 users, 5 posts, comments, likes, bookmarks, follows.',
  );
  console.log(`All users share the password: ${DEV_PASSWORD}`);
}

seedDev()
  .then(() => closePool())
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exit(1);
  });
