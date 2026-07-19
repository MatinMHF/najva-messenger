import { Router } from 'express';
import { WebAuthnController } from '../controllers/webauthn.controller';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';

// Mounted under /api/auth/webauthn (docs/ENCRYPTION.md flow B).
const router = Router();

// Registration ceremonies (authed).
router.post('/register/options', authenticate, WebAuthnController.registrationOptions);
router.post('/register/verify', authenticate, WebAuthnController.registrationVerify);
// Deferred PRF harvest → upgrade a credential to PRF-capable (Safari path).
router.post('/register/prf', authenticate, WebAuthnController.setCredentialPrf);

// Discoverable-credential login (unauthed).
router.post('/login/options', authLimiter, WebAuthnController.loginOptions);
router.post('/login/verify', authLimiter, WebAuthnController.loginVerify);

// Recovery flow B (unauthed) — PRF credentials only.
router.post('/recover/options', authLimiter, WebAuthnController.recoverOptions);
router.post('/recover/verify', authLimiter, WebAuthnController.recoverVerify);

// Credential management (authed).
router.get('/credentials', authenticate, WebAuthnController.listCredentials);
router.patch('/credentials/:id', authenticate, WebAuthnController.renameCredential);
router.delete('/credentials/:id', authenticate, WebAuthnController.deleteCredential);

export default router;
