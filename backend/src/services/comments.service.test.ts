import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { HttpError } from '../errors/httpError';

// Unit test: no database. The db/query helpers are mocked; assertPostExists and
// assertCommentOwner (via posts.service / this module) go through the mocked
// queryOne. Exercises mapping, content validation, and ownership without a DB.
vi.mock('../db/query', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query, queryOne } from '../db/query';
import {
  toComment,
  createComment,
  updateComment,
  deleteComment,
} from './comments.service';

const mockQuery = query as unknown as Mock;
const mockQueryOne = queryOne as unknown as Mock;

// The row the COMMENT_SELECT returns (author joined), not a raw table row.
const sampleCommentRow = {
  id: 17,
  content: 'Great read.',
  created_at: '2026-07-14T11:02:09Z',
  updated_at: null as string | null,
  author_username: 'neo',
  author_avatar_key: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toComment', () => {
  it('maps a row to the documented <comment> shape', () => {
    expect(toComment(sampleCommentRow)).toEqual({
      id: 17,
      content: 'Great read.',
      author: { username: 'neo', avatarUrl: null }, // avatarUrl null until step 9
      createdAt: '2026-07-14T11:02:09Z',
      updatedAt: null,
    });
  });
});

describe('createComment', () => {
  it('404s when the post does not exist, without inserting', async () => {
    mockQueryOne.mockResolvedValueOnce(null); // assertPostExists → not found
    await expect(createComment(42, 7, { content: 'hi' })).rejects.toMatchObject({ status: 404 });
    expect(mockQueryOne).toHaveBeenCalledTimes(1); // no INSERT/re-read followed
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
  ])('rejects %s content with a 400 HttpError on the content field', async (_label, content) => {
    mockQueryOne.mockResolvedValueOnce({ id: 42 }); // assertPostExists passes
    const rejection = createComment(42, 7, { content });
    await expect(rejection).rejects.toBeInstanceOf(HttpError);
    await expect(rejection).rejects.toMatchObject({ status: 400, field: 'content' });
    expect(mockQuery).not.toHaveBeenCalled(); // no INSERT on invalid input
  });

  it('inserts the comment and returns it via the shared select', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 42 }) // assertPostExists
      .mockResolvedValueOnce({ id: 17 }) // INSERT ... RETURNING id
      .mockResolvedValueOnce(sampleCommentRow); // re-read

    const comment = await createComment(42, 7, { content: 'Great read.' });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO comments'),
      [42, 7, 'Great read.'],
    );
    expect(comment).toMatchObject({ id: 17, content: 'Great read.', updatedAt: null });
  });
});

describe('updateComment ownership', () => {
  it('404s when the comment does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    await expect(updateComment(17, 7, { content: 'x' })).rejects.toMatchObject({ status: 404 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('403s when the caller is not the author', async () => {
    mockQueryOne.mockResolvedValueOnce({ author_id: 99 });
    await expect(updateComment(17, 7, { content: 'x' })).rejects.toMatchObject({ status: 403 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updates and returns the comment for the owner', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ author_id: 7 }) // assertCommentOwner
      .mockResolvedValueOnce({ ...sampleCommentRow, updated_at: '2026-07-15T09:00:00Z' }); // re-read
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const comment = await updateComment(17, 7, { content: 'Great read — thanks.' });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE comments SET content'),
      ['Great read — thanks.', 17],
    );
    expect(comment.updatedAt).toBe('2026-07-15T09:00:00Z');
  });
});

describe('deleteComment ownership', () => {
  it('404s when the comment does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    await expect(deleteComment(17, 7)).rejects.toMatchObject({ status: 404 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('403s when the caller is not the author', async () => {
    mockQueryOne.mockResolvedValueOnce({ author_id: 99 });
    await expect(deleteComment(17, 7)).rejects.toMatchObject({ status: 403 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('deletes the comment for the owner', async () => {
    mockQueryOne.mockResolvedValueOnce({ author_id: 7 });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await deleteComment(17, 7);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM comments'),
      [17],
    );
  });
});
