<p align="center">
  <b>English</b> | <a href="README.fa.md">فارسی</a>
</p>

# najva-messenger

A self-hosted, end-to-end encrypted messenger — text chat, voice and video calls, encrypted file sharing, and push notifications — that runs entirely on a server you control.

Messages are encrypted in the browser before they leave the device, and the server never holds a key capable of reading them. It stores wrapped key blobs and ciphertext, nothing else. A single command on a fresh Ubuntu box brings the whole stack up, asks you four questions, and issues a TLS certificate (or self-signed Root CA).

## Why this exists

Most self-hosted chat platforms make you choose: either the deployment is a single command and the encryption is transport-only, or the encryption is real and the deployment is a weekend of YAML. `najva-messenger` is for the case where you want both — an instance that:

- encrypts message content and attachments client-side,
- carries voice and video through your own SFU and TURN server, and
- installs from one `curl | bash` on a stock Ubuntu 24.04 server,

without handing your conversations to anyone else's infrastructure.

## Services

Five containers come up together under Docker Compose:

| Service | Role |
| --- | --- |
| `client` | React + Vite SPA, service worker, offline queue, English/Persian with full RTL |
| `server` | Express API, PostgreSQL via Prisma, Redis presence, Socket.IO delivery |
| `media-server` | mediasoup SFU for one-to-one and group audio/video calls |
| `turn` | coturn, for clients behind NAT or restrictive networks |
| `nginx` | Single entry point; terminates TLS, proxies API, WebSocket and static traffic |

Admin functions — user management, storage quotas, support tickets, instance statistics — are part of the same web app, gated by an admin flag. **Access the Admin Panel at `/admin` (e.g. `https://<domain_or_ip>/admin`) after signing in with your admin account.**

## Self-Signed Root CA Certificate & HTTPS Support

When deployed on an IP address without a domain name, Najva automatically issues a **Self-Signed Root CA certificate** so camera, microphone, voice messages, and WebCrypto operate securely under HTTPS.

- **CA Certificate Download Link:** `http://<server_ip>/ca.crt`
- **Installation:** Download `najva-ca.crt` by opening `http://<server_ip>/ca.crt` on your device, double-click to install it into **Trusted Root Certification Authorities**, then access your server via `https://<server_ip>`.

## Encryption model

Every message is sealed with a per-conversation key that only participants hold. That key is wrapped by each member's account key, which derives from a key-encryption key computed from the account password. The server stores only the wrapped blobs and a login verifier — it never sees the password, the KEK, or the plaintext. Attachments are encrypted before upload, so files on disk are opaque.

Passkey PRF is supported as a second unwrap path for recovery, and identity fingerprints let two people verify each other out of band.

See [docs/ENCRYPTION.md](docs/ENCRYPTION.md) for the full key hierarchy.

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install.sh | sudo bash
```

Upon installation completion:
- **App URL:** `https://<domain_or_ip>`
- **Admin Panel:** `https://<domain_or_ip>/admin`
- **CA Download Link:** `http://<server_ip>/ca.crt`

## Management Menu (`najva`)

Run `sudo najva` on the server to open the interactive menu:

| Option | What it does |
| --- | --- |
| Retry Let's Encrypt SSL certificate | Re-runs certbot for domain issuance |
| Issue self-signed SSL certificate & CA link | Generates a self-signed Root CA with SAN extensions for IP access and provides a download link at `/ca.crt` |
| Reset admin username and password | Re-provisions the admin account |
| Restart / Stop / Start service | Docker compose lifecycle management |
| Status / Logs / Check for updates | Operational monitoring and updates |
| Uninstall | Removes all containers, images, volumes, and checkout data |

## License

MIT
