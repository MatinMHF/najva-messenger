import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  message: 'Too many auth requests from this IP, please try again after 15 minutes'
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5000,
  message: 'Too many requests, please try again later'
});

// Strict limiter for recovery-code verification (docs/ENCRYPTION.md flow A):
// a recovery code is a bearer secret, so brute-force attempts must be throttled
// hard. Scoped per (IP + username) so one target account can't be hammered and
// one IP can't spray many accounts. Keyed off the request body username.
export const recoverVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Custom key => skip the library's built-in IPv6 keygen validation.
  validate: false,
  keyGenerator: (req) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.toLowerCase() : '';
    return `recover:${req.ip}:${username}`;
  },
  message: 'Too many recovery attempts. Please try again later.',
});
