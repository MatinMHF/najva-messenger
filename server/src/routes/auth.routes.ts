import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { ResetController } from '../controllers/reset.controller';
import { authenticate } from '../middleware/auth';
import { authLimiter, recoverVerifyLimiter } from '../middleware/rateLimit';
import webauthnRoutes from './webauthn.routes';

const router = Router();

// WebAuthn / passkeys (docs/ENCRYPTION.md flow B) → /api/auth/webauthn/*
router.use('/webauthn', webauthnRoutes);

router.post('/register', authLimiter, AuthController.register);
router.post('/login', authLimiter, AuthController.login);
// KDF params for the login page — rate-limited, enumeration-resistant.
router.get('/params', authLimiter, AuthController.params);
router.post('/refresh', AuthController.refresh);
router.post('/logout', AuthController.logout);

// Active sessions / devices
router.get('/sessions', authenticate, AuthController.listSessions);
router.delete('/sessions/:id', authenticate, AuthController.revokeSession);
// Step-1 username existence check for the forgot-password wizard.
router.post('/recover/request', authLimiter, AuthController.requestReset);
// Recovery flow A (docs/ENCRYPTION.md): verify is strictly rate-limited.
router.post('/recover/verify', recoverVerifyLimiter, AuthController.recoverVerify);
router.post('/recover/complete', authLimiter, AuthController.recoverComplete);

// Password change + current wrapped-MK material (authed).
router.get('/keys/master', authenticate, AuthController.keyMaterial);
router.post('/password/change', authenticate, AuthController.changePassword);

router.post('/2fa/setup', authenticate, AuthController.setup2FA);
router.post('/2fa/verify', authenticate, AuthController.verify2FA);
router.post('/2fa/disable', authenticate, AuthController.disable2FA);

// Recovery-code regeneration (authed + password + TOTP if enabled).
router.post('/recovery/reset', authenticate, AuthController.resetRecoveryCodes);
// Recovery flow C (docs/ENCRYPTION.md): support-OTP handshake to a live device.
router.post('/reset/request', authLimiter, ResetController.request);
router.post('/reset/approve', authenticate, ResetController.approve);
router.post('/reset/deny', authenticate, ResetController.deny);
router.get('/reset/status/:resetId', authLimiter, ResetController.status);
router.post('/reset/complete', authLimiter, ResetController.complete);

// Recovery flow D (docs/ENCRYPTION.md): admin-gated cryptographic-loss reset.
router.post('/reset/lost', authLimiter, ResetController.lost);

export default router;
