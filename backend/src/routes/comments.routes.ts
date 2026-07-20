import { Router } from 'express';

// Two mount points — see docs/api_design.md "Comments":
//  - postCommentsRouter at /api/posts/:postId/comments (GET, POST)
//  - commentRouter      at /api/comments/:commentId    (PATCH, DELETE)
export const postCommentsRouter = Router({ mergeParams: true });
export const commentRouter = Router();
