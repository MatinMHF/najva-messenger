import { Router } from 'express';
import { FileController } from '../controllers/file.controller';
import { authenticate } from '../middleware/auth';
import { uploadAttachment } from '../middleware/upload';

const router = Router();
router.use(authenticate);

router.post('/upload', uploadAttachment, FileController.uploadFile);
router.get('/:id', FileController.getFile);
router.get('/:id/thumbnail', FileController.getThumbnail);

export default router;
