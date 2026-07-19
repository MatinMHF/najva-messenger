import multer from 'multer';
import { config } from '../config';
import { Request } from 'express';
import { AppError } from '../utils/errors';
import fs from 'fs';

// Ensure upload directory exists
if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix);
  }
});

export const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize
  }
});

/** Accept the encrypted file blob plus an optional encrypted thumbnail blob. */
export const uploadAttachment = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);
