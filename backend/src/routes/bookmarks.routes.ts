import { Router } from 'express';

// Two mount points — see docs/api_design.md "Bookmarks":
//  - postBookmarkRouter at /api/posts/:postId/bookmark (PUT, DELETE)
//  - bookmarksRouter    at /api/bookmarks              (GET)
export const postBookmarkRouter = Router({ mergeParams: true });
export const bookmarksRouter = Router();
