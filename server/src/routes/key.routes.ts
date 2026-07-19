import { Router } from 'express';
import { KeyController } from '../controllers/key.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/bundle', KeyController.uploadBundle);
router.get('/:userId/bundle', KeyController.getBundle);
router.get('/:userId/prekey', KeyController.getPreKey);

export default router;
