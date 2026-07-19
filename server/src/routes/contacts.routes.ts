import { Router } from 'express';
import { ContactsController } from '../controllers/contacts.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', ContactsController.list);
router.post('/:userId', ContactsController.add);
router.delete('/:userId', ContactsController.remove);

export default router;
