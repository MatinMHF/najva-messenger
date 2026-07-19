import { Router } from 'express';
import { CallController } from '../controllers/call.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/ice', CallController.ice);
router.post('/:conversationId/grant', CallController.grant);

export default router;
