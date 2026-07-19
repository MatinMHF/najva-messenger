# Najva Calls & Screen-Share Architecture (Module D)

Status: **implemented** (2026-07). Companion to `docs/ENCRYPTION.md`.

## Topology — SFU (mediasoup), not mesh

Calls use a **Selective Forwarding Unit** (mediasoup, `media-server/`), not a
peer-to-peer mesh.

- **Mesh** would require each participant to send its media to every other
  participant: O(n²) uploads. For a 100-person call each client would need ~99
  upstreams — infeasible on consumer uplinks.
- **SFU**: each client sends **one** upstream to the server, which forwards
  (fans out) to the others. Upstream load is O(1) per publisher; the server does
  the fan-out. This is what makes **100 concurrent users** achievable.

### Sizing for 100 concurrent
- mediasoup runs **one Worker per CPU core** (`numWorkers = os.cpus().length`);
  each Worker is a separate C++ process handling many transports. Routers
  (one per call room) are assigned round-robin across Workers.
- Each publisher = 1 inbound + (n−1) outbound RTP streams handled server-side;
  CPU, not client bandwidth, is the ceiling. Scale out by adding cores/hosts and
  sharding rooms across Workers (already round-robin) — no client change.
- Bitrate is capped (`maxIncomingBitrate` 1.5 Mbps, initial outgoing 1 Mbps) to
  keep per-stream cost bounded.

## Media authentication

The SFU is a separate service; it must not admit arbitrary clients.

1. Client asks the main server `POST /calls/:conversationId/grant`. The main
   server checks conversation membership and returns a **60-second media-grant
   JWT** `{ userId, roomId }` signed with `MEDIA_JWT_SECRET` (shared with the
   media-server), plus ICE servers.
2. The client connects to the media-server with that token; the media-server
   verifies it and takes the **roomId from the token** — never from client input
   — so a user can only join a conversation the main server authorized. Forged or
   missing grants are rejected at the socket handshake. (Verified end-to-end.)

## Degradation / connectivity (spec: IPv6 outage, UDP blocked, no direct path)

ICE is handed a layered candidate set so a call connects on hostile networks:

1. **STUN** (`stun:…:3478`) — direct/host + server-reflexive (best path).
2. **TURN over UDP** (`turn:…:3478?transport=udp`) — relay when there's no direct
   path.
3. **TURN over TCP** (`turn:…:3478?transport=tcp`) — relay when **UDP is blocked**.
4. **TURN over TLS** (`turns:…:5349?transport=tcp`, also `:443`) — relay that
   **looks like HTTPS**, for DPI / aggressive filtering.

The client can also pin `iceTransportPolicy: 'relay'` to force TURN-only
(`SfuSession.join(..., forceRelay=true)`) for testing the restricted path.

TURN credentials are **time-limited REST creds** (coturn `use-auth-secret`):
`username = "<expiry>:<userId>"`, `credential = base64(HMAC-SHA1(TURN_SECRET,
username))`. No per-user secrets are stored; coturn recomputes the HMAC.
`TURN_SECRET` must equal coturn's `static-auth-secret`.

> TLS ports need a certificate (`turn/turn_cert.pem` + `turn_pkey.pem`); a dev
> self-signed pair is generated per the comment in `turn/turnserver.conf`.
> Without it, TURN over UDP/TCP on 3478 still works — only the TLS ports stay down.

## Signaling & lifecycle

`socket/handlers/call.handler.ts` handles only call **lifecycle** (no SDP/ICE
relay — the SFU negotiates media directly): `call:initiate` rings conversation
members, `call:accept` / `call:reject`, `call:end`. A Redis participant set per
conversation tracks who's in the call so the last leaver ends it and abrupt
disconnects are cleaned up. Membership is enforced via `socket.rooms` (a socket
only joins `conv:{id}` rooms it belongs to).

## Deliberate tradeoff: media is SFU-relayed, NOT E2EE

DTLS-SRTP encrypts media **in transit**, but the mediasoup SFU terminates it and
**can see the media** to forward it. End-to-end encryption (Insertable Streams /
SFrame) was **not** adopted (user-confirmed): it's much more complex, browser-
limited, and not required by the spec. The E2EE guarantee (`docs/ENCRYPTION.md`)
covers **messages and files**; **call media is not E2EE** — a conscious decision.

## Verified vs. manual
- **Automated/live-verified:** grant issuance + membership gating, ICE credential
  format (TCP + TLS fallbacks present), media-server rejects forged/missing
  grants, `joinRoom` + `createWebRtcTransport` negotiation.
- **Manual (real devices):** actual audio/video/screen-share media flow and the
  UDP-blocked → TURN-TCP/TLS fallback require real cameras/mics and browsers —
  headless environments can't `getUserMedia` a real device.
