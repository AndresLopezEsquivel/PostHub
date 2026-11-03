import { Router } from 'express';
import {
  listPosts,
  createPost,
  getPost,
  updatePost,
  deletePost,
} from '../controllers/posts.controller';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.get('/', listPosts);
router.post('/', requireAuth, createPost);
router.get('/:postId', getPost);
router.patch('/:postId', requireAuth, updatePost);
router.delete('/:postId', requireAuth, deletePost);

export default router;
