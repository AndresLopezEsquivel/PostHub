import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { HttpError } from '../errors/httpError';

// Unit test: no database. The db/query helpers are mocked so the service's pure
// logic — excerpt/pagination/mapping, validation, ownership, and the 23503→400
// mapping — is exercised without connecting.
vi.mock('../db/query', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query, queryOne, queryMany, withTransaction } from '../db/query';
import {
  buildExcerpt,
  avatarKeyToUrl,
  normalizePagination,
  toPostCard,
  toPostDetail,
  createPost,
  updatePost,
  deletePost,
} from './posts.service';

const mockQuery = query as unknown as Mock;
const mockQueryOne = queryOne as unknown as Mock;
const mockQueryMany = queryMany as unknown as Mock;
const mockWithTransaction = withTransaction as unknown as Mock;

// The row the shared card SELECT returns (not a table row).
const sampleCardRow = {
  id: 42,
  title: 'On absurdism',
  content: 'Camus opens with a short remark.',
  image_key: null as string | null,
  created_at: '2026-07-14T10:22:31Z',
  updated_at: null as string | null,
  author_username: 'neo',
  author_avatar_key: null as string | null,
  categories: [{ name: 'Philosophy', slug: 'philosophy' }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildExcerpt', () => {
  it('returns a short body unchanged, with whitespace collapsed', () => {
    expect(buildExcerpt('  Camus   opens\nwith. ')).toBe('Camus opens with.');
  });

  it('truncates a long body on a word boundary and appends an ellipsis', () => {
    const body = 'word '.repeat(80); // 400 chars of "word " repeated
    const excerpt = buildExcerpt(body);

    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(201); // max + the ellipsis
    expect(excerpt).not.toMatch(/wor…$/); // cut at a space, not mid-word
    expect(body.replace(/\s+/g, ' ').startsWith(excerpt.slice(0, -1))).toBe(true);
  });
});

describe('avatarKeyToUrl', () => {
  it('is null when there is no key', () => {
    expect(avatarKeyToUrl(null)).toBeNull();
  });

  it('is null even for a key until the uploads pass builds URLs', () => {
    expect(avatarKeyToUrl('avatars/neo.jpg')).toBeNull();
  });
});

describe('normalizePagination', () => {
  it('defaults to page 1, limit 20 when absent', () => {
    expect(normalizePagination(undefined, undefined)).toEqual({ page: 1, limit: 20 });
  });

  it('parses numeric strings from the query', () => {
    expect(normalizePagination('3', '10')).toEqual({ page: 3, limit: 10 });
  });

  it('falls back on non-numeric or < 1 values', () => {
    expect(normalizePagination('abc', '0')).toEqual({ page: 1, limit: 20 });
  });

  it('caps the limit at 100', () => {
    expect(normalizePagination('1', '500')).toEqual({ page: 1, limit: 100 });
  });
});

describe('toPostCard / toPostDetail', () => {
  it('maps a row to the documented card with stubbed counts/state', () => {
    expect(toPostCard(sampleCardRow)).toEqual({
      id: 42,
      title: 'On absurdism',
      excerpt: 'Camus opens with a short remark.',
      author: { username: 'neo', avatarUrl: null },
      categories: [{ name: 'Philosophy', slug: 'philosophy' }],
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      bookmarkedByMe: false,
      createdAt: '2026-07-14T10:22:31Z',
    });
  });

  it('detail extends the card with content, imageKey, and updatedAt', () => {
    const detail = toPostDetail({
      ...sampleCardRow,
      image_key: 'posts/42.jpg',
      updated_at: '2026-07-15T09:00:00Z',
    });

    expect(detail).toMatchObject({
      id: 42,
      content: 'Camus opens with a short remark.',
      imageKey: 'posts/42.jpg',
      updatedAt: '2026-07-15T09:00:00Z',
      likeCount: 0,
      likedByMe: false,
    });
  });
});

describe('createPost validation', () => {
  const valid = { title: 'On absurdism', content: 'Camus opens with…', categoryIds: [1] };

  it.each([
    ['missing title', { ...valid, title: '' }, 'title'],
    ['whitespace title', { ...valid, title: '   ' }, 'title'],
    ['missing content', { ...valid, content: '' }, 'content'],
    ['non-array categoryIds', { ...valid, categoryIds: 3 }, 'categoryIds'],
    ['non-integer categoryId', { ...valid, categoryIds: [1, 2.5] }, 'categoryIds'],
    ['zero categoryId', { ...valid, categoryIds: [0] }, 'categoryIds'],
    ['numeric imageKey', { ...valid, imageKey: 123 }, 'imageKey'],
  ])('rejects %s with a 400 on the right field', async (_label, input, field) => {
    await expect(createPost(7, input)).rejects.toMatchObject({ status: 400, field });
    await expect(createPost(7, input)).rejects.toBeInstanceOf(HttpError);
    // Validation fails before any DB write.
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });
});

describe('createPost', () => {
  it('inserts the post and its categories, then returns the card', async () => {
    const tx = { query: vi.fn().mockResolvedValue({ rows: [{ id: 42 }] }) };
    mockWithTransaction.mockImplementation(async (fn) => fn(tx));
    mockQueryOne.mockResolvedValue(sampleCardRow); // fetchPostRow re-read

    const card = await createPost(7, {
      title: 'On absurdism',
      content: 'Camus opens with…',
      categoryIds: [1, 8],
      imageKey: null,
    });

    expect(tx.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO posts'),
      [7, 'On absurdism', 'Camus opens with…', null],
    );
    expect(tx.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO post_categories'),
      [42, 1, 8],
    );
    expect(card.id).toBe(42);
    expect(card).toMatchObject({ likeCount: 0, likedByMe: false });
  });

  it('maps a foreign-key violation on a bad category id to a 400', async () => {
    mockWithTransaction.mockRejectedValue({ code: '23503', constraint: 'post_categories_category_id_fkey' });

    await expect(
      createPost(7, { title: 'x', content: 'y', categoryIds: [999] }),
    ).rejects.toMatchObject({ status: 400, field: 'categoryIds' });
  });
});

describe('updatePost ownership', () => {
  it('404s when the post does not exist', async () => {
    mockQueryOne.mockResolvedValue(null);
    await expect(updatePost(42, 7, { title: 'x' })).rejects.toMatchObject({ status: 404 });
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('403s when the caller is not the author', async () => {
    mockQueryOne.mockResolvedValue({ author_id: 99 });
    await expect(updatePost(42, 7, { title: 'x' })).rejects.toMatchObject({ status: 403 });
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('updates and returns the card for the owner', async () => {
    // assertOwner first, then fetchPostRow re-read.
    mockQueryOne
      .mockResolvedValueOnce({ author_id: 7 })
      .mockResolvedValueOnce(sampleCardRow);
    const tx = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    mockWithTransaction.mockImplementation(async (fn) => fn(tx));

    const card = await updatePost(42, 7, { title: 'On absurdism, revisited', categoryIds: [2] });

    expect(tx.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE posts SET'),
      expect.arrayContaining(['On absurdism, revisited', 42]),
    );
    expect(tx.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM post_categories'),
      [42],
    );
    expect(card.id).toBe(42);
  });
});

describe('deletePost ownership', () => {
  it('404s when the post does not exist', async () => {
    mockQueryOne.mockResolvedValue(null);
    await expect(deletePost(42, 7)).rejects.toMatchObject({ status: 404 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('403s when the caller is not the author', async () => {
    mockQueryOne.mockResolvedValue({ author_id: 99 });
    await expect(deletePost(42, 7)).rejects.toMatchObject({ status: 403 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('deletes the post for the owner', async () => {
    mockQueryOne.mockResolvedValue({ author_id: 7 });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await deletePost(42, 7);

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM posts'), [42]);
  });
});

// mockQueryMany is wired for listPosts; asserted end-to-end in the integration
// suite rather than here (thin SQL-string assertions add little).
void mockQueryMany;
