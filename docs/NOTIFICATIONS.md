# Najva Notifications Architecture (Module F)

Status: **implemented** (2026-07). Companion to `docs/ENCRYPTION.md` / `CALLS.md`.

## Per-platform strategy (not one uniform system)

| Platform | Primary transport | Status in this repo |
|---|---|---|
| **Web** | Web Push (Push API + service worker, VAPID) | **Fully implemented + testable** |
| **Android** | FCM | Adapter (`services/push/native.transport.ts`), config-gated |
| **iOS** | APNs | Adapter, config-gated |
| **Windows** | Self-hosted (no OS push service) | Persistent WebSocket + adapter |

This repository ships a **web client only**. FCM/APNs/Windows are therefore
**integration-ready adapters**: a future native client registers its token via
`POST /notifications/devices` and, once the matching credentials are set
(`FCM_SERVER_KEY`, `APNS_KEY`, …), the adapter lights up. Unconfigured, they
no-op with a warning. Web Push is real and end-to-end exercisable here.

## Privacy: metadata-only payloads (E2EE-safe)

Message content is end-to-end encrypted — the server holds only ciphertext — so
a notification **never contains message text**. The push payload carries only
metadata the server legitimately has: sender **display name** (`title`), a
generic body cue (`new_message` / `incoming_call`), `kind`, and `conversationId`.
The client fetches and decrypts the actual message when opened. The stored
`Notification` row likewise holds only `{kind, conversationId, actorId}`.

## Delivery decision: in-band vs. background push

The persistent Socket.IO connection is itself the **self-hosted delivery
channel**. On a new message (`MessageController.sendMessage`) or an incoming call
(`call:initiate`):

1. **Connected** members already received the event over their live socket
   (`message:new` / `call:incoming`) — this is the "backgrounded-but-alive"
   channel. They get **no** duplicate push.
2. Members **without a live socket** (`isUserOnline` = false) get a
   **background push** via `NotificationService.dispatch` → Web Push subscriptions
   + registered native devices. Dead endpoints (404/410) are pruned.

Per-conversation **mute** (`ConversationMember.isMuted`) suppresses push.

## Android fallback + battery optimization

When FCM is unavailable, Android falls back to the self-hosted WebSocket — but
that only reaches an app that is **backgrounded yet still alive**. Mobile battery
optimization / app-standby can kill that connection, so `BatteryOptimizationNotice`
guides the user to exempt the app from battery optimization on mobile when OS push
isn't active.

**Accepted, out-of-scope gap:** if the app is **fully killed** and FCM is down,
nothing can wake it — a self-hosted channel cannot start a dead process without an
OS-level push service. Only the backgrounded-but-alive case is handled (by design).

## Endpoints
- `GET /notifications/vapid` (public) — VAPID public key.
- `POST /notifications/subscribe` / `DELETE /notifications/subscribe` — Web Push.
- `POST /notifications/devices` — native token registration (android/ios/windows).
- `GET /notifications` — recent notification metadata; `POST /notifications/read`.

## Verified vs. manual
- **Automated:** subscription/device persistence, `dispatch` fan-out +
  **metadata-only** payload (no plaintext) + dead-endpoint pruning
  (`notification.flow.test.ts`, web-push mocked).
- **Manual (real browser):** grant permission, background the tab, receive a Web
  Push toast, click → opens the conversation. (Headless push is unreliable.)
