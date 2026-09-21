import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { createUploadUrl } from '../controllers/uploads.controller';

// Mounted at /api/uploads — see docs/api_design.md "Uploads and health".
// Auth-only. Returns a presigned S3 PUT URL + object key; the client uploads bytes
// straight to S3 and only ever sends us the resulting key.
const router = Router();

router.post('/presign', requireAuth, createUploadUrl);

export default router;
