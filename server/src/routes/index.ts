import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import conversationRoutes from './conversation.routes';
import messageRoutes from './message.routes';
import fileRoutes from './file.routes';
import keyRoutes from './key.routes';
import adminRoutes from './admin.routes';
import supportRoutes from './support.routes';
import contactsRoutes from './contacts.routes';
import callRoutes from './call.routes';
import notificationRoutes from './notification.routes';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/conversations', conversationRoutes);
router.use('/messages', messageRoutes);
router.use('/files', fileRoutes);
router.use('/keys', keyRoutes);
router.use('/admin', adminRoutes);
router.use('/support', supportRoutes);
router.use('/contacts', contactsRoutes);
router.use('/calls', callRoutes);
router.use('/notifications', notificationRoutes);

export default router;
