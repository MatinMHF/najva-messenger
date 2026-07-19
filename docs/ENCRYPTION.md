# Najva Encryption & Key Management Architecture (v1)

Status: **approved design** (2026-07-04). Every agent building auth, messaging,
files, or recovery reads this document first. Changes to this design require
explicit user sign-off.

## Goals

1. **E2EE at rest and in transit:** the server (and anyone inspecting the
   database or uploads volume — including the hosting admin) can never read
   message content or file content. Only ciphertext and wrapped keys are stored.
2. **Recovery without silent data loss:** password recovery via recovery code,
   passkey, or a still-logged-in device preserves message history. Only when
   *all three* are unavailable is history lost — explicitly, never silently.
3. **Multi-device by construction:** any device that can unwrap the Master Key
   can read all conversations.

Non-goals for v1 (documented gaps, see Threat Model): per-message forward
secrecy, key-verification safety numbers, metadata privacy.

## Key hierarchy

```
password ──PBKDF2-SHA256(600,000 iters, kekSalt 16B random)──> PRK (32B)
   ├─ HKDF-SHA256(info="najva:kek:v1")   → KEK      (32B — NEVER leaves the client)
   └─ HKDF-SHA256(info="najva:login:v1") → loginKey (32B hex — sent to server, bcrypt'd)

recoveryCode (16B random; displayed as Crockford-base32 groups XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX)
   ├─ HKDF-SHA256(salt=wrapSalt 16B, info="najva:mk:recovery:v1") → RWK (32B)
   └─ SHA-256("najva:rc:verify:v1" ‖ codeBytes)                   → verifierHash (server-stored)

passkey PRF output (32B) ── HKDF-SHA256(salt=prfSalt 32B, info="najva:mk:prf:v1") → PWK (32B)

MK — Master Key (32B random, one per user)
 ├─ AES-256-GCM-wrapped by KEK       → User.mkPasswordWrapped
 ├─ AES-256-GCM-wrapped by each RWK  → RecoveryCode.wrappedMk   (one row per code, 8 codes)
 ├─ AES-256-GCM-wrapped by PWK       → WebAuthnCredential.wrappedMk (PRF-capable passkeys only)
 └─ encrypts User.encryptedPrivateKeys = {identity X25519 secret, Ed25519 signing secret}

CK — Conversation Key (32B random, per conversation, versioned)
 ├─ sealed to each member's X25519 identityKeyPublic (tweetnacl sealed box)
 │    blob layout: ephPub(32) ‖ nonce(24) ‖ nacl.box(ck)   → ConversationKey rows
 ├─ encrypts message content: AES-256-GCM,
 │    AAD = "najva:msg:v1:{conversationId}:{ckVersion}"
 └─ wraps per-attachment FKs → Attachment.encryptedKey

FK — File Key (32B random, per attachment)
 └─ AES-256-GCM encrypts file bytes (and thumbnail) client-side BEFORE upload
```

### Primitive decisions

| Decision | Choice | Why |
|---|---|---|
| Password KDF | WebCrypto PBKDF2-SHA256, 600,000 iterations, 16B random salt | Native (no WASM/CSP issues), OWASP 2023 floor; `kekIterations` stored per user so it can be raised later without breaking migration |
| KEK/loginKey split | One PBKDF2 run → HKDF split with distinct `info` strings | Server bcrypts `loginKey` and never sees the password ⇒ even a malicious server cannot derive KEK. HKDF one-wayness makes loginKey useless for KEK recovery |
| AEAD everywhere | AES-256-GCM, 12B IV, via `aesGcmEncrypt/aesGcmDecrypt` in `client/src/lib/crypto/primitives.ts` (extended with optional AAD) | Already implemented + unit-tested |
| AAD | UTF-8 context strings (e.g. `najva:msg:v1:{convId}:{ckVersion}`) | Binds ciphertext to its context; prevents cross-conversation/version splicing |
| CK member wrap | Sealed box from tweetnacl: ephemeral X25519 pair + `nacl.box` (`sealTo`/`openSealed` in primitives.ts) | Asymmetric ⇒ an admin can add a member knowing only the member's public identity key |
| Recovery codes | 8 × 16 random bytes, Crockford base32 | 128-bit ⇒ plain SHA-256 verifier hashes are brute-force safe (old 4-byte-hex codes were not); verifier and wrap-key derivations are domain-separated |
| Envelope encoding | JSON string `{v:1, alg:"A256GCM"|"sealbox", iv?, ct}` (base64 fields) | Versioned, debuggable, fits existing String columns |
| Signal ratchet lib | **Dormant in v1.** Only identity X25519/Ed25519 keys are load-bearing; PreKey/X3DH infra stays uploaded but unused | Account-key architecture (user-approved) gives multi-device + recoverable history; ratchet remains the future forward-secrecy upgrade |

## Client key handling

- **MK cache:** IndexedDB stores (a) a **non-extractable device-local AES-GCM
  CryptoKey** ("device key") and (b) the MK encrypted under that device key.
  Routine operations decrypt the MK on demand; raw bytes are zeroed after use.
  Why not a non-extractable MK CryptoKey? Flow C requires device A to *seal raw
  MK bytes* to the recovering device's ephemeral key — a non-extractable key
  can never be exported, so a recoverable-on-device copy must exist. The device
  key being non-extractable means stolen IndexedDB files alone don't reveal MK;
  a script running in the page (XSS) could decrypt and exfiltrate it, which is
  why CSP + no-innerHTML are load-bearing mitigations (see Threat Model).
- **Identity secrets** (needed raw by tweetnacl): kept in a module-scoped memory
  variable only; re-decrypted from the `encryptedPrivateKeys` ciphertext (cached
  in IndexedDB) using the MK CryptoKey on each page load.
- **CK cache:** in-memory `Map<conversationId, Map<version, Uint8Array>>`,
  refetched from `GET /conversations/:id/keys` on miss.

## Server data model (Prisma)

- `User` +`kekSalt`, +`kekIterations` (default 600000), +`mkPasswordWrapped`,
  +`encryptedPrivateKeys`, +`mkVersion` (default 1); `recoveryCodes` String
  column **removed**; `passwordHash` = bcrypt(loginKey).
- `RecoveryCode { verifierHash @unique, wrappedMk, wrapSalt, usedAt? }`
- `WebAuthnCredential { credentialId @unique, publicKey, counter BigInt,
  transports?, deviceName?, prfSupported, prfSalt?, wrappedMk?, lastUsedAt? }`
- `Session { refreshTokenHash @unique, prevTokenHash? @unique, deviceName?,
  userAgent?, ip?, expiresAt, revokedAt? }` — refresh rotation; a refresh
  presenting a hash matching `prevTokenHash` of an already-rotated session is
  **token reuse ⇒ revoke the session**.
- `ConversationKey { conversationId, userId, version, wrappedKey, wrappedById,
  @@unique([conversationId, userId, version]) }`
- `PushSubscription { endpoint @unique, p256dh, auth }`
- `Conversation` +`currentKeyVersion` (default 1); `ConversationType` +`CHANNEL`.
- `Message` +`isSystemPlaintext` (default false) — server-authored SYSTEM
  messages (join/leave notices, reset OTPs) are legitimately plaintext.

## Flows

### Register
Client: generate identity keys + MK + 8 recovery codes → derive KEK/loginKey →
wrap MK under KEK and each RWK → encrypt identity secrets under MK → seal
SAVED_MESSAGES CK to self → single `POST /auth/register` with all material.
Server never returns raw codes (client generated them; shown once with
download, behind an explicit-acknowledgment gate before first chat entry).

### Login
`GET /auth/params?username=` → `{kekSalt, kekIterations}` (unknown usernames
get a deterministic fake salt `HMAC-SHA256(serverSecret, username)` — no
enumeration). Client derives KEK+loginKey → `POST /auth/login {username,
loginKey, totpCode?}` → server bcrypt-verifies, creates Session, returns
tokens + `{mkPasswordWrapped, encryptedPrivateKeys, kekSalt, kekIterations}` →
client unwraps MK, imports as non-extractable CryptoKey.

### Send / receive message
Send: ensure CK for `conversation.currentKeyVersion` → AES-GCM(content, AAD) →
`POST {type, encryptedContent, iv, senderKeyVersion}`.
Receive: look up CK by `senderKeyVersion` (fetch shares on miss) → decrypt with
AAD. Decryption failure renders a non-crashing "undecryptable" bubble.
SYSTEM + `isSystemPlaintext` renders raw.

### Attachments
Random FK → encrypt file bytes (v1: single-shot in memory; chunked streaming is
a flagged follow-up) → upload opaque blob → `Attachment.encryptedKey` = FK
wrapped by CK (envelope includes ckVersion). Thumbnails encrypted the same way.
Download: fetch blob → decrypt client-side → objectURL. `GET /files/:id`
enforces conversation membership.

### Membership changes
- **Add member:** the adder's client fetches the new member's key bundle and
  seals the *current* CK version for them; the server rejects a member-add
  without the `wrappedKey`.
- **Remove member:** rotate CK forward — new version sealed to all remaining
  active members; server validates `version == currentKeyVersion + 1` and
  share-set completeness, then bumps `currentKeyVersion` and emits
  `conversation:key` (targeted) + `conversation:key_rotated` (room).
  The removed member retains pre-removal history (honest: they already saw it).
- **Channels:** cap 5,000 members; rotation throttled (O(members) sealed boxes
  computed on one admin's client). Sender-keys is the long-term fix.

### Password change (logged in)
Re-enter current password → derive old KEK → unwrap fresh `mkPasswordWrapped`
(`GET /keys/master`) → new salt → derive new KEK/loginKey → re-wrap →
`POST /auth/password/change {currentLoginKey, newLoginKey, newKekSalt,
newKekIterations, newMkPasswordWrapped}` — atomic; revokes all other sessions.
Recovery-code and passkey wraps are untouched (they wrap the same MK).

### Recovery paths

**A. Recovery code (no session — history preserved):**
1. Client computes verifierHash from the typed code →
   `POST /auth/recover/verify {username, verifierHash}` → server matches an
   unused RecoveryCode → `{wrappedMk, wrapSalt, encryptedPrivateKeys,
   recoveryToken}` (5-min single-use Redis token).
2. Client derives RWK → unwraps MK (wrong code = GCM tag failure) → new
   kekSalt/KEK/loginKey → re-wrap.
3. `POST /auth/recover/complete {recoveryToken, newLoginKey, kekSalt,
   kekIterations, mkPasswordWrapped}` → server swaps password material, marks
   the code used, revokes all sessions, **disables TOTP** (the code proves
   account ownership), returns tokens.

**B. Passkey (history preserved):** `POST /auth/webauthn/recover/options` →
`navigator.credentials.get()` with PRF eval → `POST /auth/webauthn/recover/verify`
→ `{wrappedMk, prfSalt, encryptedPrivateKeys, recoveryToken}` → client unwraps
MK via PWK → same `recover/complete`.

**C. Support-OTP to a logged-in device (history preserved via the live device):**
1. Logged-out device B: generate ephemeral X25519 pair →
   `POST /auth/reset/request {username, ephemeralPub}` →
   `{resetId, resetSecret}`; Redis `reset:{resetId}` =
   `{userId, ephemeralPub, otpHash, status: PENDING}`, TTL 10 min, one active
   request per user.
2. Server sends a 6-digit OTP to device A as a plaintext SYSTEM message
   (najva-support conversation) **plus** socket `reset:pending
   {resetId, ephemeralFingerprint, deviceInfo}`. A's UI shows the OTP, the
   requesting device info, and a **6-word fingerprint of ephemeralPub** that B
   also displays — the user visually compares (mitigates server key-swap MITM).
3. User approves on A → A seals its MK to ephemeralPub →
   `POST /auth/reset/approve {resetId, sealedMk}` (authed) → status APPROVED.
4. B polls `GET /auth/reset/status/:resetId?secret=` → opens sealedMk with its
   ephemeral secret → re-wraps under the new password →
   `POST /auth/reset/complete {resetId, resetSecret, otp, newLoginKey, kekSalt,
   kekIterations, mkPasswordWrapped}` — OTP hash check (max 5 attempts), swaps
   material, revokes all sessions except issues fresh tokens to B. TOTP stays
   enabled (flow proves device control, not identity reset).

**D. Cryptographic loss (nothing left — explicit, admin-gated):**
Support ticket → admin verifies identity out-of-band →
`POST /admin/users/:id/authorize-reset` issues a 24-h one-time token surfaced
via support chat → `POST /auth/reset/lost` uploads brand-new MK, identity keys,
and recovery material; server wipes old RecoveryCode rows, passkey wrappedMk
blobs, and the user's ConversationKey rows, bumps `mkVersion`, revokes all
sessions. **Old messages are permanently unreadable** — persistent UI warning
before and after. Server emits `conversation:member_key_reset {userId}` per
conversation; the next online admin member's client re-seals the *current* CK
version to the new identity key. Never rotate versions here — history stays
sealed by design.

### 2FA interplay
TOTP is a pure server-side login gate; it never touches key material.
Flows A, B, D disable TOTP; flow C keeps it.

## Threat model — what v1 does NOT protect

- **Metadata:** the server sees who talks to whom, membership, timestamps,
  message/attachment sizes, presence, push endpoints, conversation names and
  avatars (plaintext in v1 — flagged for later).
- **Key substitution:** the server hands out identity public keys and relays
  sealed CKs; a malicious server could substitute keys and MITM *new*
  conversations. v1 has **no safety numbers / key verification** — accepted,
  documented gap. The flow-C fingerprint comparison is the only manual check.
- **XSS:** injected script can read decrypted messages live and — because a
  device-key-wrapped MK copy must exist for flow C — can decrypt and exfiltrate
  the MK on a logged-in device. Mitigations: strict CSP, no
  `dangerouslySetInnerHTML`, sanitize rendered content. (Disk-level theft of
  IndexedDB without code execution in the origin does not reveal MK: the
  device key is non-extractable.)
- **Forward secrecy:** a leaked CK exposes that conversation's history for that
  key version. CK rotation on membership change limits blast radius; the
  ratchet upgrade is the long-term answer.
- **Flow-C trust:** the server relays `ephemeralPub`; the word-fingerprint
  comparison depends on user diligence.

## Migration

Dev data is wiped (existing messages are plaintext; existing recovery codes are
32-bit and server-decryptable — not worth retrofitting). `prisma migrate dev
--name init_e2ee` on a fresh DB creates the migrations baseline; production
uses `prisma migrate deploy`. The legacy `encryptText/decryptText` recovery-code
crypto in `server/src/utils/crypto.ts` is deleted with the flow that used it.
