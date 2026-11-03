import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  bookmarkPost,
  unbookmarkPost,
  listBookmarks,
} from '../controllers/bookmarks.controller';

export const postBookmarkRouter = Router({ mergeParams: true });
postBookmarkRouter.put('/', requireAuth, bookmarkPost);
postBookmarkRouter.delete('/', requireAuth, unbookmarkPost);

export const bookmarksRouter = Router();
bookmarksRouter.get('/', requireAuth, listBookmarks);
