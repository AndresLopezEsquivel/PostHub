import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { createUploadUrl } from '../controllers/uploads.controller';

const router = Router();

router.post('/presign', requireAuth, createUploadUrl);

export default router;
