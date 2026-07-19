import { Router } from 'express';
import { SupportController } from '../controllers/support.controller';
import cookieParser from 'cookie-parser';

const router = Router();
router.use(cookieParser());

router.post('/tickets', SupportController.createTicket);
router.get('/tickets/:token', SupportController.getTicket);
router.post('/tickets/:token/messages', SupportController.addMessage);

export default router;
