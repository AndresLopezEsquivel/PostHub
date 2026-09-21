import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  listNotifications,
  markNotificationRead,
  markAllRead,
} from '../controllers/notifications.controller';

// Mounted at /api/notifications — see docs/api_design.md "Notifications".
// All auth-only. The literal /read-all is registered before the /:notificationId
// param route so it can't be captured as an id.
const router = Router();

router.get('/', requireAuth, listNotifications);
router.post('/read-all', requireAuth, markAllRead);
router.patch('/:notificationId', requireAuth, markNotificationRead);

export default router;
