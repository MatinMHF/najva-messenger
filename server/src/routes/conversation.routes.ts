import { Router } from 'express';
import { ConversationController } from '../controllers/conversation.controller';
import { MessageController } from '../controllers/message.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', ConversationController.list);
router.post('/', ConversationController.createGroup);
router.get('/saved', ConversationController.getSavedMessages);
router.post('/dm', ConversationController.createDM);
router.get('/dm/:userId', ConversationController.getOrCreateDM);
router.get('/:id/keys', ConversationController.getKeys);
router.get('/:id', ConversationController.getConversation);
router.put('/:id', ConversationController.updateGroup);
router.post('/:id/members', ConversationController.addMembers);
router.delete('/:id/members/:userId', ConversationController.removeMember);
router.delete('/:id/leave', ConversationController.leaveGroup);

router.get('/:id/messages', MessageController.getMessages);
router.post('/:id/messages', MessageController.sendMessage);

// Mute / Block / Delete (Wave 0 stubs -> Agent E Task E.3)
router.post('/:id/mute', ConversationController.mute);
router.delete('/:id/mute', ConversationController.unmute);
router.post('/:id/block', ConversationController.block);
router.delete('/:id/block', ConversationController.unblock);
router.delete('/:id', ConversationController.deleteConversation);
router.post('/:id/clear', ConversationController.clearHistory);
router.post('/:id/pin', ConversationController.pinMessage);

export default router;
