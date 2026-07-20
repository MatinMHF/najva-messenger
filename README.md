<p align="center">
  <b>English</b> | <a href="README.fa.md">فارسی</a>
</p>

# najva-messenger

A self-hosted, end-to-end encrypted messenger — text chat, voice and video
calls, encrypted file sharing, and push notifications — that runs entirely on
a server you control.

Messages are encrypted in the browser before they leave the device, and the
server never holds a key capable of reading them. It stores wrapped key blobs
and ciphertext, nothing else. A single command on a fresh Ubuntu box brings
the whole stack up, asks you four questions, and issues a TLS certificate.

## Why this exists

Most self-hosted chat platforms make you choose: either the deployment is a
single command and the encryption is transport-only, or the encryption is
real and the deployment is a weekend of YAML. `najva-messenger` is for the
case where you want both — an instance that:

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

Admin functions — user management, storage quotas, support tickets, instance
statistics — are part of the same web app, gated by an admin flag.

## Encryption model

Every message is sealed with a per-conversation key that only participants
hold. That key is wrapped by each member's account key, which derives from a
key-encryption key computed from the account password. The server stores only
the wrapped blobs and a login verifier — it never sees the password, the KEK,
or the plaintext. Attachments are encrypted before upload, so files on disk
are opaque.

Passkey PRF is supported as a second unwrap path for recovery, and identity
fingerprints let two people verify each other out of band.

> **Note:** Because the password derives the key material, a lost password
> cannot be reset server-side without discarding that account's history. This
> is a property of the design, not a missing feature — the `najva` menu's
> admin reset therefore re-provisions the account rather than rotating the
> password in place.

See [docs/ENCRYPTION.md](docs/ENCRYPTION.md) for the full key hierarchy.

## Installation

### Prerequisites

- Ubuntu 24.04 with a public IP and root access
- A domain pointed at that IP, if you want HTTPS (optional)

Docker is installed automatically if it isn't already present.

### One command

```bash
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install.sh | sudo bash
```

The installer clones the project into `/opt/najva`, generates every secret in
the environment file at random, and asks four questions:

| Question | Default | Notes |
| --- | --- | --- |
| HTTP port | `80` | Press Enter to accept |
| HTTPS port | `443` | Press Enter to accept |
| Admin username and password | `admin` | Password is confirmed and must be 8+ characters |
| Domain | *(none)* | Leave blank to serve plain HTTP on the server's IP |
| Let's Encrypt email | `admin@<domain>` | Only asked when a domain was given |

With a domain, certbot issues a certificate in standalone mode and Nginx is
regenerated with an HTTPS server block plus an HTTP redirect. Renewal runs
from certbot's own timer and reloads Nginx in place.

If issuance fails — DNS not yet propagated, port 80 unreachable — the install
still completes over plain HTTP and tells you so. The certificate can be
retried at any time from the management menu.

## Management

The installer places a `najva` command on the server. Running it opens a menu:

| Option | What it does |
| --- | --- |
| Retry SSL certificate | Re-runs certbot; also accepts a domain if installed without one |
| Reset admin username and password | Re-provisions the admin account (asks for confirmation) |
| Restart the service | `docker compose restart` |
| Stop the service | `docker compose down` |
| Start the service | `docker compose up -d` |
| Status | Version, container states, domain, TLS state and ports |
| Logs | Follows the aggregated container logs |
| Check for updates | Compares the installed version against `main` and offers to update |

Retrying the certificate updates the environment file, the TURN realm and the
Nginx configuration in a single step, so moving an IP-only instance onto a
domain is one menu choice rather than a manual edit of three files.

## Updating

The installed version is recorded in `VERSION` at the root of the checkout.
Both the installer and the management menu compare it against the same file on
`main`, so there is one source of truth for what "current" means.

Re-running the installer on a server that already has Najva will not reinstall
it. It reports the installed version and stops, or offers to update if `main`
has a newer one — it never regenerates the secrets or resets the admin account
of a working install.

Updating fast-forwards the checkout, regenerates the Nginx and TURN
configuration from the answers in `.env`, rebuilds the images and restarts the
stack. `.env` is not tracked by git, so the secrets and the admin credentials
survive; the generated configuration files are tracked, which is why they are
written again after the update rather than left at their repository defaults.

```bash
najva            # pick "Check for updates"
```

## Configuration

All runtime configuration lives in a single `.env` at the repository root,
written by the installer and documented by
[`.env.example`](.env.example). The values worth knowing:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL`, `REDIS_URL` | Service connection strings |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SERVER_SECRET`, `MEDIA_JWT_SECRET` | Four independent signing secrets |
| `TURN_SECRET` | Must match `static-auth-secret` in `turn/turnserver.conf` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push keypair, generated at install time |
| `CORS_ORIGIN`, `WEBAUTHN_ORIGIN`, `MEDIA_SERVER_PUBLIC_URL` | All three are the instance's public origin |

## Local development

```bash
git clone https://github.com/MatinMHF/najva-messenger.git
cd najva-messenger
cp .env.example .env
docker compose -f docker-compose.dev.yml up
```

The development compose file mounts the sources and runs the API and the Vite
dev server with hot reload. Tests live beside the code in
`server/src/__tests__` and `client/src/**/__tests__`, and run with `npm test`
in either directory.

> **Note:** The development images bake their dependencies at build time, so
> rebuild the image after adding an npm package — otherwise the container
> keeps running the old dependency set.

## Security notes

- Message plaintext and attachment contents never reach the server; it stores
  ciphertext and wrapped keys only.
- Every secret in `.env` is generated per-install with `openssl rand`; there
  are no shipped defaults to forget to change.
- The `.env` file is written `chmod 600` and is excluded from version control.
- TURN credentials are short-lived HMAC tokens minted per call, not a static
  shared username and password.

## Further documentation

- [docs/ENCRYPTION.md](docs/ENCRYPTION.md) — key hierarchy, message envelope
  format and recovery flows
- [docs/CALLS.md](docs/CALLS.md) — signalling, SFU topology and TURN
  credential minting
- [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) — Web Push, delivery adapters
  and battery considerations

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. To report a security
issue, see [SECURITY.md](SECURITY.md).

## License

MIT
