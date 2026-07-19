import * as OTPAuth from 'otpauth';

export const generateTOTPSecret = () => {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
};

export const createTOTP = (secret: string, username: string) => {
  return new OTPAuth.TOTP({
    issuer: 'Najva Messenger',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
};

export const verifyTOTP = (secret: string, token: string, username: string) => {
  const totp = createTOTP(secret, username);
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
};
