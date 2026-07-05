import { Redis } from 'ioredis';
import { config } from '../config';

export const redisClient = new Redis(config.redisUrl, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: true,
});

redisClient.on('error', (err) => console.error('Redis error:', err));
redisClient.connect().catch(console.error);
