import { Router } from 'express';
import authRoutes from './auth.routes';
import postsRoutes from './posts.routes';
import feedRoutes from './feed.routes';
import likesRoutes from './likes.routes';
import { postCommentsRouter, commentRouter } from './comments.routes';
import { postBookmarkRouter, bookmarksRouter } from './bookmarks.routes';
import usersRoutes from './users.routes';
import categoriesRoutes from './categories.routes';
import notificationsRoutes from './notifications.routes';
import uploadsRoutes from './uploads.routes';
import healthRoutes from './health.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/posts/:postId/like', likesRoutes);
router.use('/posts/:postId/comments', postCommentsRouter);
router.use('/posts/:postId/bookmark', postBookmarkRouter);
router.use('/posts', postsRoutes);
router.use('/comments', commentRouter);
router.use('/bookmarks', bookmarksRouter);
router.use('/feed', feedRoutes);
router.use('/users', usersRoutes);
router.use('/categories', categoriesRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/uploads', uploadsRoutes);
router.use('/health', healthRoutes);

export default router;
