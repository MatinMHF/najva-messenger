import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/search', UserController.searchUsers);
router.get('/:id', UserController.getProfile);
router.put('/profile', UserController.updateProfile);
router.put('/settings', UserController.updateSettings);
router.put('/password', UserController.changePassword);

export default router;
