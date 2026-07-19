import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://najva:password@localhost:5432/najva',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
  // Keyed HMAC for deterministic fake KDF salts (enumeration resistance on
  // GET /auth/params). Never leaves the server.
  serverSecret: process.env.SERVER_SECRET || 'your-server-secret',
  uploadDir: process.env.UPLOAD_DIR || '/app/uploads',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600', 10),
  defaultStorageLimit: BigInt(process.env.DEFAULT_STORAGE_LIMIT || '524288000'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost',
  // WebAuthn / passkeys (docs/ENCRYPTION.md flow B). The client is served on
  // port 80 in dev and prod (docker-compose), so the browser origin has no
  // explicit port suffix. rpID is the registrable domain (no scheme/port).
  webauthnRpId: process.env.WEBAUTHN_RP_ID || 'localhost',
  webauthnRpName: process.env.WEBAUTHN_RP_NAME || 'Najva Messenger',
  webauthnOrigin: process.env.WEBAUTHN_ORIGIN || 'http://localhost',
  // Calls / SFU (Module D). The media-grant JWT is verified by the standalone
  // media-server, so MEDIA_JWT_SECRET is shared with it via env. TURN_SECRET is
  // the coturn `static-auth-secret` used to mint time-limited REST credentials.
  mediaJwtSecret: process.env.MEDIA_JWT_SECRET || 'your-media-secret',
  turnSecret: process.env.TURN_SECRET || 'your-turn-secret',
  turnUrls: (process.env.TURN_URLS || 'turn:localhost:3478?transport=udp,turn:localhost:3478?transport=tcp,turns:localhost:5349?transport=tcp').split(','),
  stunUrls: (process.env.STUN_URLS || 'stun:localhost:3478').split(','),
  turnCredentialTtl: parseInt(process.env.TURN_CREDENTIAL_TTL || '86400', 10),
  mediaServerUrl: process.env.MEDIA_SERVER_URL || 'http://localhost:4443',
  // URL the BROWSER uses to reach the media-server SFU. Must be host-reachable
  // (the internal `media-server:4443` compose hostname is not resolvable from the
  // client), so this defaults to the host-published port, not the internal name.
  mediaServerPublicUrl: process.env.MEDIA_SERVER_PUBLIC_URL || 'http://localhost:4443',
  // Notifications (Module F). Web Push uses VAPID (fully implemented). FCM/APNs/
  // Windows are config-gated adapters — a future native client registers a token;
  // they no-op with a warning when their credentials are absent.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@najva.local',
  fcmServerKey: process.env.FCM_SERVER_KEY || '',
  apnsKey: process.env.APNS_KEY || '',
};

// Well-known development defaults that must never reach production.
const INSECURE_DEFAULTS = {
  jwtSecret: 'your-jwt-secret',
  jwtRefreshSecret: 'your-refresh-secret',
  serverSecret: 'your-server-secret',
} as const;

export interface SecretConfig {
  nodeEnv: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  serverSecret: string;
}

/**
 * Refuse to run in production with default secrets (Phase 1 security review).
 * Called at startup; throwing here aborts server boot.
 */
export const assertProductionSecrets = (cfg: SecretConfig = config): void => {
  if (cfg.nodeEnv !== 'production') return;
  const keys = Object.keys(INSECURE_DEFAULTS) as (keyof typeof INSECURE_DEFAULTS)[];
  const offenders = keys.filter((key) => cfg[key] === INSECURE_DEFAULTS[key]);
  if (offenders.length > 0) {
    throw new Error(
      `Refusing to start in production with default secret(s): ${offenders.join(', ')}. ` +
        'Set strong JWT_SECRET, JWT_REFRESH_SECRET and SERVER_SECRET env vars.',
    );
  }
};
