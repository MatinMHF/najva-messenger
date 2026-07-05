import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://najva:password@localhost:5432/najva',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
  uploadDir: process.env.UPLOAD_DIR || '/app/uploads',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600', 10),
  defaultStorageLimit: BigInt(process.env.DEFAULT_STORAGE_LIMIT || '524288000'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost',
};
