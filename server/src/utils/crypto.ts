// Recovery codes are now generated client-side (16 random bytes each,
// Crockford base32 display) and the server only ever receives hashed verifiers
// plus client-wrapped key material (docs/ENCRYPTION.md). The former weak
// 32-bit server-generated codes — and the legacy server-decryptable
// encryptText/decryptText helpers — have been removed with the flows that used
// them.

export {};
