import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

describe('app factory', () => {
  it('serves /api/health without a listening socket', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns 404-shaped response for unknown API routes', async () => {
    const app = createApp();
    const res = await request(app).get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
  });
});
