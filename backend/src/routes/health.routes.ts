import { Router } from 'express';
import { healthCheck } from '../controllers/health.controller';

// Mounted at /api/health — see docs/api_design.md "Uploads and health"
const router = Router();

router.get('/', healthCheck);

export default router;
