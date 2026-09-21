import { Router } from 'express';
import {
  listPosts,
  createPost,
  getPost,
  updatePost,
  deletePost,
} from '../controllers/posts.controller';
import { requireAuth } from '../middleware/requireAuth';

// Mounted at /api/posts — see docs/api_design.md "Posts"
// GET /, POST /, GET /:postId, PATCH /:postId, DELETE /:postId
//
// Reads are public; writes require a session (requireAuth). Ownership (403) is
// enforced inside updatePost/deletePost, which is authenticated-but-not-owner —
// a different failure from the 401 requireAuth produces.
const router = Router();

router.get('/', listPosts);
router.post('/', requireAuth, createPost);
router.get('/:postId', getPost);
router.patch('/:postId', requireAuth, updatePost);
router.delete('/:postId', requireAuth, deletePost);

export default router;
