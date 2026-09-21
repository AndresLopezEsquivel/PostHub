import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  listPostComments,
  createComment,
  updateComment,
  deleteComment,
} from '../controllers/comments.controller';

// Two mount points — see docs/api_design.md "Comments":
//  - postCommentsRouter at /api/posts/:postId/comments (GET, POST)
//  - commentRouter      at /api/comments/:commentId    (PATCH, DELETE)
// mergeParams on the post-scoped router so the handler can read :postId.
export const postCommentsRouter = Router({ mergeParams: true });
postCommentsRouter.get('/', listPostComments);
postCommentsRouter.post('/', requireAuth, createComment);

export const commentRouter = Router();
commentRouter.patch('/:commentId', requireAuth, updateComment);
commentRouter.delete('/:commentId', requireAuth, deleteComment);
