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
password ──PBKDF2-SHA256(600,000 iters, kekSalt 16B random)──► PRK (32B)
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
| Password KDF | WebCrypto PBKDF2-SHA256, 600,000 iterations, 16B random salt | Native (no WASM/CSP issues), OWASP 2023 floor |
| KEK/loginKey split | One PBKDF2 run → HKDF split with distinct `info` strings | Server bcrypts `loginKey` and never sees the password |
| AEAD everywhere | AES-256-GCM, 12B IV, via `aesGcmEncrypt/aesGcmDecrypt` in `client/src/lib/crypto/primitives.ts` | Already implemented + unit-tested |
| AAD | UTF-8 context strings (e.g. `najva:msg:v1:{convId}:{ckVersion}`) | Binds ciphertext to its context |
| CK member wrap | Sealed box from tweetnacl: ephemeral X25519 pair + `nacl.box` | Asymmetric ⇒ admin can add a member knowing only their public key |
| Recovery codes | 8 × 16 random bytes, Crockford base32 | 128-bit ⇒ SHA-256 verifier hashes are brute-force safe |
| Envelope encoding | JSON string `{v:1, alg:"A256GCM"|"sealbox", iv?, ct}` (base64 fields) | Versioned, debuggable |
| Signal ratchet lib | **Dormant in v1.** Only identity X25519/Ed25519 keys are load-bearing | Ratchet remains the future forward-secrecy upgrade |

## Threat model — what v1 does NOT protect

- **Metadata:** the server sees who talks to whom, membership, timestamps, message/attachment sizes, presence.
- **Key substitution:** no safety numbers / key verification — accepted, documented gap.
- **XSS:** injected script can read decrypted messages live. Mitigations: strict CSP, no `dangerouslySetInnerHTML`.
- **Forward secrecy:** a leaked CK exposes that conversation's history for that key version.

See the full document in the repository for complete flow descriptions (register, login, send/receive, attachments, password change, all recovery paths, 2FA interplay, and migration notes).
