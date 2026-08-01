import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  bookmarkPost,
  unbookmarkPost,
  listBookmarks,
} from '../controllers/bookmarks.controller';

// Two mount points — see docs/api_design.md "Bookmarks":
//  - postBookmarkRouter at /api/posts/:postId/bookmark (PUT, DELETE)
//  - bookmarksRouter    at /api/bookmarks              (GET)
export const postBookmarkRouter = Router({ mergeParams: true });
postBookmarkRouter.put('/', requireAuth, bookmarkPost);
postBookmarkRouter.delete('/', requireAuth, unbookmarkPost);

export const bookmarksRouter = Router();
bookmarksRouter.get('/', requireAuth, listBookmarks);
