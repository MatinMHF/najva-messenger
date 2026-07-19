import { describe, it, expect } from 'vitest';
import { assertProductionSecrets } from '../config';

const base = {
  nodeEnv: 'production',
  jwtSecret: 'a-strong-secret',
  jwtRefreshSecret: 'another-strong-secret',
  serverSecret: 'server-strong-secret',
};

describe('assertProductionSecrets', () => {
  it('throws in production when the JWT secret is the well-known default', () => {
    expect(() => assertProductionSecrets({ ...base, jwtSecret: 'your-jwt-secret' })).toThrow();
  });

  it('throws in production when the refresh secret is the well-known default', () => {
    expect(() => assertProductionSecrets({ ...base, jwtRefreshSecret: 'your-refresh-secret' })).toThrow();
  });

  it('throws in production when the server secret is the well-known default', () => {
    expect(() => assertProductionSecrets({ ...base, serverSecret: 'your-server-secret' })).toThrow();
  });

  it('passes in production with strong secrets', () => {
    expect(() => assertProductionSecrets(base)).not.toThrow();
  });

  it('is a no-op outside production even with default secrets', () => {
    expect(() =>
      assertProductionSecrets({
        nodeEnv: 'development',
        jwtSecret: 'your-jwt-secret',
        jwtRefreshSecret: 'your-refresh-secret',
        serverSecret: 'your-server-secret',
      }),
    ).not.toThrow();
  });
});
