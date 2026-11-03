import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  listNotifications,
  markNotificationRead,
  markAllRead,
} from '../controllers/notifications.controller';

const router = Router();

router.get('/', requireAuth, listNotifications);
router.post('/read-all', requireAuth, markAllRead);
router.patch('/:notificationId', requireAuth, markNotificationRead);

export default router;
