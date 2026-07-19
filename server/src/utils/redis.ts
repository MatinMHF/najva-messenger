import Redis from 'ioredis';
import { config } from '../config';

// lazyConnect: no eager TCP connection at import time — the first command
// connects. Keeps tests (and tooling that imports app code) from hanging
// when Redis isn't running.
export const redisClient = new Redis(config.redisUrl, { lazyConnect: true });

redisClient.on('error', (err) => {
  console.error('Redis client error', err);
});
