import { Router } from 'express';
import { MessageController } from '../controllers/message.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.put('/:id', MessageController.editMessage);
router.delete('/:id', MessageController.deleteMessage);
router.post('/:id/forward', MessageController.forwardMessage);

export default router;
