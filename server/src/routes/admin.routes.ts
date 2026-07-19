import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/users', AdminController.listUsers);
router.put('/users/:id/block', AdminController.blockUser);
router.put('/users/:id/unblock', AdminController.unblockUser);
router.put('/users/:id/suspend', AdminController.suspendUser);
router.put('/users/:id/unsuspend', AdminController.unsuspendUser);
router.put('/users/:id/storage-limit', AdminController.setStorageLimit);
router.put('/users/:id/reset-password', AdminController.resetPassword);
// Recovery flow D — issue a one-time cryptographic-loss authorization token.
router.post('/users/:id/authorize-reset', AdminController.authorizeReset);
router.get('/stats', AdminController.getStats);

router.get('/support-tickets', AdminController.listSupportTickets);
router.get('/support-tickets/:id', AdminController.getSupportTicket);
router.post('/support-tickets/:id/reply', AdminController.replySupportTicket);
router.put('/support-tickets/:id/status', AdminController.updateTicketStatus);

export default router;
