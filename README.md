<div align="center">

```
 _   _        _            
| \ | |      (_)           
|  \| | __ _  ___   ____ _ 
| . ` |/ _` |/ \ \ / / _` |
| |\  | (_| | | \ V / (_| |
\_| \_/\__,_| |  \_/ \__,_|
           _/ |            
          |__/             
```

# Najva · نجوا

**A secure, self-hosted, end-to-end encrypted messenger**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://docs.docker.com/compose/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org)

[Features](#-features) · [Architecture](#-architecture) · [Quick Start](#-quick-start) · [Installation](#-installation) · [Security](#-security) · [Contributing](#-contributing)

</div>

---

## 🌟 Overview

Najva (نجوا, Persian for *whisper*) is a fully self-hosted, **end-to-end encrypted** messaging platform. Every message, file, and attachment is encrypted on the client before it ever reaches the server — the server (and anyone with access to it) can only see ciphertext.

Built for teams and individuals who need **privacy without compromising usability**.

---

## ✨ Features

| Category | Feature |
|---|---|
| 💬 **Messaging** | Real-time text, file, voice & video messages |
| 🔐 **Security** | Client-side E2EE (AES-256-GCM + X25519 sealed box) |
| 📞 **Calls** | WebRTC voice & video via mediasoup SFU |
| 👥 **Conversations** | Direct, Group, Channel, and Saved Messages |
| 🔑 **Auth** | Password + TOTP 2FA + Passkey (WebAuthn) |
| 🔄 **Recovery** | Recovery codes, passkey, device-to-device transfer |
| 🌐 **i18n** | Persian (فارسی) and English, RTL/LTR aware |
| 🎨 **Themes** | Dark and Light mode |
| 👤 **Admin** | User management, support ticket system |
| 📁 **Files** | Encrypted file uploads with per-attachment keys |
| 🟢 **Presence** | Online/offline/away status via Socket.IO |
| 🔔 **Notifications** | Push notification infrastructure |

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        Clients                           │
│           (React + TypeScript + Zustand)                 │
└─────────────────────┬────────────────────────────────────┘
                      │ HTTPS / WSS
┌─────────────────────▼────────────────────────────────────┐
│                  Nginx Reverse Proxy                     │
└──────┬──────────────────────────────────────┬────────────┘
       │                                      │
┌──────▼──────┐                    ┌──────────▼───────────┐
│   Client    │                    │  Server (Node.js)    │
│  (Static)   │                    │  Express + Socket.IO │
└─────────────┘                    └──────┬──────┬────────┘
                                          │      │
                              ┌───────────▼┐  ┌──▼──────┐
                              │ PostgreSQL  │  │  Redis  │
                              └────────────┘  └─────────┘
                                          │
                              ┌───────────▼───────────┐
                              │  Media Server         │
                              │  (mediasoup SFU)      │
                              └───────────────────────┘
                                          │
                              ┌───────────▼───────────┐
                              │  TURN Server (coturn)  │
                              └───────────────────────┘
```

### Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Zustand, Socket.IO Client |
| Backend | Node.js, Express, Socket.IO, Prisma ORM |
| Database | PostgreSQL 16 |
| Cache / Pub-Sub | Redis 7 |
| Media | mediasoup 3 (SFU), coturn (TURN) |
| Crypto | WebCrypto API, TweetNaCl (X25519 / Ed25519) |
| Proxy | Nginx |
| Container | Docker + Docker Compose |

---

## 🔐 Security

Najva implements a **layered key hierarchy** so the server never has access to plaintext:

```
password ──PBKDF2-SHA256 (600k iters)──► PRK
   ├── HKDF → KEK   (never leaves client)
   └── HKDF → loginKey (bcrypt'd on server)

Master Key (MK, 32B random)
   ├── wrapped by KEK  → stored server-side
   ├── wrapped by Recovery Key Wrapping Key (×8 codes)
   ├── wrapped by Passkey PRF output
   └── encrypts identity keys (X25519 + Ed25519)

Conversation Key (CK, 32B random)
   ├── sealed to each member's X25519 public key
   └── AES-256-GCM encrypts every message & file
```

See [`docs/ENCRYPTION.md`](docs/ENCRYPTION.md) for the full threat model, key flows, and design decisions.

**Account recovery options (history preserved):**
- 🔑 Recovery codes (8 × 128-bit, Crockford Base32)
- 🔐 WebAuthn Passkey with PRF extension
- 📱 Device-to-device transfer (ephemeral X25519, word-fingerprint MITM check)
- 🆘 Admin-gated cryptographic reset (history lost — explicit warning)

---

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/install/) ≥ 2

### Run in 3 steps

```bash
# 1. Clone
git clone https://github.com/MatinMHF/najva-messenger.git
cd najva-messenger

# 2. Configure
cp .env.example .env
# Edit .env — at minimum set strong secrets for JWT_SECRET, JWT_REFRESH_SECRET,
# POSTGRES_PASSWORD, and TURN_SECRET.

# 3. Start
docker compose up -d
```

Open **http://localhost** in your browser. 🎉

---

## 📦 Installation

### Windows

```powershell
# Run as Administrator
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\install\install-windows.ps1
```

The script will:
- Check and install Docker Desktop if missing
- Generate secure random secrets in `.env`
- Build and start all services
- Open the app in your default browser

### Linux / macOS

```bash
bash install/install-linux.sh
```

The script will:
- Detect your distro (Debian/Ubuntu, RHEL/Fedora, Arch) and install Docker
- Generate cryptographically random secrets
- Build and launch all services

### Manual

```bash
git clone https://github.com/MatinMHF/najva-messenger.git
cd najva-messenger
cp .env.example .env
# Fill in .env values
docker compose up --build -d
```

---

## 🛠 Development

```bash
# Hot-reload development mode
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Run server tests
cd server && npm test

# Run client tests  
cd client && npm test

# Database seed (dev only)
cd server && npm run seed
```

### Environment Variables

See [`.env.example`](.env.example) for all available variables with descriptions.

**Required secrets (must be changed before production):**

| Variable | Description |
|---|---|
| `JWT_SECRET` | Access token signing key (≥ 32 random bytes) |
| `JWT_REFRESH_SECRET` | Refresh token signing key (≥ 32 random bytes) |
| `POSTGRES_PASSWORD` | Database password |
| `TURN_SECRET` | TURN server shared secret |

---

## 🚢 Production Deployment

1. **Provision a server** — Ubuntu 22/24 LTS recommended, ≥ 2 CPU, ≥ 4 GB RAM.

2. **Open firewall ports:**

| Port | Protocol | Service |
|---|---|---|
| 80 | TCP | HTTP (Nginx) |
| 443 | TCP | HTTPS (Nginx) |
| 3478 | TCP/UDP | TURN |
| 5349 | TCP/UDP | TURNS (TLS) |
| 4443 | TCP | mediasoup signalling |
| 2000–2020 | UDP | mediasoup RTC |
| 49152–49200 | UDP | coturn RTP relay |

3. **Configure `.env`** with production values, including `MEDIASOUP_ANNOUNCED_IP` set to your server's public IP.

4. **Enable TLS** — update `nginx/nginx.conf` with your SSL certificate paths.

5. **Deploy:**
```bash
docker compose up --build -d
```

---

## 📁 Project Structure

```
najva-messenger/
├── client/              # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/  # UI components (auth, chat, common, layout)
│   │   ├── lib/crypto/  # E2EE: primitives, ratchet, X3DH, session
│   │   ├── pages/       # Route-level pages
│   │   ├── store/       # Zustand state stores
│   │   └── i18n/        # FA/EN translations
│   └── Dockerfile
├── server/              # Node.js API + Socket.IO
│   ├── src/
│   │   ├── controllers/ # HTTP request handlers
│   │   ├── services/    # Business logic
│   │   ├── routes/      # Express routers
│   │   ├── socket/      # Real-time event handlers
│   │   └── middleware/  # Auth, rate-limit, upload, validate
│   ├── prisma/          # Database schema & migrations
│   └── Dockerfile
├── media-server/        # mediasoup SFU server
├── nginx/               # Reverse proxy config
├── turn/                # coturn TURN server config
├── docs/                # ENCRYPTION.md and design docs
├── install/             # One-click install scripts
│   ├── install-windows.ps1
│   └── install-linux.sh
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example
```

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

1. Fork the repository
2. Create your branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

[MIT](LICENSE) © 2026 MatinMHF
