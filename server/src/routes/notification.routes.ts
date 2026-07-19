import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public: the VAPID public key is safe to expose (it's the public half).
router.get('/vapid', NotificationController.vapidKey);

router.use(authenticate);
router.get('/', NotificationController.list);
router.post('/subscribe', NotificationController.subscribe);
router.delete('/subscribe', NotificationController.unsubscribe);
router.post('/devices', NotificationController.registerDevice);
router.post('/read', NotificationController.markRead);

export default router;
