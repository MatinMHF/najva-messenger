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
**یک پیام‌رسان امن، خودمیزبان و رمزنگاری‌شده سرتاسر**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://docs.docker.com/compose/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org)

</div>

---

> 🌐 **Language / زبان:** &nbsp; [🇮🇷 فارسی](#-نجوا--پیام‌رسان-امن-خودمیزبان) &nbsp;|&nbsp; [🇬🇧 English](#-najva--secure-self-hosted-messenger)

---

<!-- ══════════════════════════════════════════════════════════════════ -->
<!-- ═══════════════════════  PERSIAN / فارسی  ══════════════════════ -->
<!-- ══════════════════════════════════════════════════════════════════ -->

## 🇮🇷 نجوا — پیام‌رسان امن خودمیزبان

نجوا یک پلتفرم پیام‌رسانی **رمزنگاری‌شده سرتاسر (E2EE)** و کاملاً خودمیزبان است. هر پیام، فایل و پیوست قبل از ارسال به سرور روی مرورگر کاربر رمزنگاری می‌شود — سرور (و هر کسی که به آن دسترسی دارد) فقط متن رمزنگاری‌شده می‌بیند.

### ✨ ویژگی‌ها

| دسته | ویژگی |
|---|---|
| 💬 **پیام‌رسانی** | پیام متنی، فایل، صوت و تصویر بلادرنگ |
| 🔐 **امنیت** | E2EE سمت کلاینت (AES-256-GCM + X25519 sealed box) |
| 📞 **تماس** | تماس صوتی/تصویری WebRTC از طریق mediasoup SFU |
| 👥 **مکالمات** | مستقیم، گروهی، کانال، و پیام‌های ذخیره‌شده |
| 🔑 **احراز هویت** | رمزعبور + احراز دو مرحله‌ای TOTP + Passkey (WebAuthn) |
| 🔄 **بازیابی** | کدهای بازیابی، passkey، انتقال دستگاه به دستگاه |
| 🌐 **زبان** | فارسی و انگلیسی، پشتیبانی RTL/LTR |
| 🎨 **تم** | حالت تاریک و روشن |
| 👤 **ادمین** | مدیریت کاربران، سیستم تیکت پشتیبانی |

### 🚀 نصب سریع — بدون نیاز به دانلود سورس

> فقط Docker باید روی سیستم شما نصب باشد.

#### 🐧 Linux / macOS

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install/install-linux.sh)
```

اسکریپت به‌صورت خودکار:
- Docker را نصب می‌کند (اگر نباشد) — Debian/Ubuntu، RHEL/Fedora، Arch پشتیبانی می‌شوند
- فایل `.env` با secretهای تصادفی ایجاد می‌کند
- سرویس‌ها را build و راه‌اندازی می‌کند
- آدرس `http://localhost` را در مرورگر باز می‌کند

#### 🪟 Windows (PowerShell به‌عنوان Administrator)

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; `
irm https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install/install-windows.ps1 | iex
```

اسکریپت به‌صورت خودکار:
- Docker Desktop را نصب می‌کند (از طریق winget)
- فایل `.env` با secretهای تصادفی امن ایجاد می‌کند
- سرویس‌ها را build و راه‌اندازی می‌کند

#### 🐳 نصب دستی (همه سیستم‌ها)

```bash
# دانلود فایل‌های پیکربندی
mkdir najva && cd najva
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/.env.example  -o .env
mkdir -p nginx turn
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/nginx/nginx.conf -o nginx/nginx.conf
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/turn/turnserver.conf -o turn/turnserver.conf

# ویرایش .env و تنظیم secretها
# سپس:
docker compose up -d
```

### 🏗️ معماری

```
┌─────────────────────────────────────┐
│         کلاینت‌ها (React)            │
└──────────────────┬──────────────────┘
                   │ HTTPS / WSS
┌──────────────────▼──────────────────┐
│         Nginx Reverse Proxy          │
└────────┬────────────────────┬────────┘
         │                    │
┌────────▼──────┐  ┌──────────▼──────────┐
│  Client       │  │  Server (Node.js)    │
│  (Static)     │  │  Express + Socket.IO │
└───────────────┘  └────────┬────────────┘
                            │
              ┌─────────────┼──────────┐
              │             │          │
        ┌─────▼────┐  ┌────▼───┐  ┌───▼────────────┐
        │PostgreSQL│  │ Redis  │  │ Media (mediasoup│
        └──────────┘  └────────┘  │ + coturn TURN)  │
                                  └─────────────────┘
```

### 🔐 امنیت — سلسله مراتب کلیدها

```
رمزعبور ──PBKDF2-SHA256 (600k iter)──▶ PRK
   ├── HKDF → KEK   (هرگز از کلاینت خارج نمی‌شود)
   └── HKDF → loginKey (bcrypt شده روی سرور)

Master Key (MK، 32 بایت تصادفی)
   ├── رمزنگاری‌شده با KEK  → ذخیره روی سرور
   ├── رمزنگاری‌شده با کدهای بازیابی (×8)
   ├── رمزنگاری‌شده با PRF خروجی Passkey
   └── کلیدهای هویت را رمزنگاری می‌کند (X25519 + Ed25519)

Conversation Key (CK، 32 بایت، به‌ازای هر مکالمه)
   ├── sealed به کلید عمومی X25519 هر عضو
   └── AES-256-GCM همه پیام‌ها و فایل‌ها را رمزنگاری می‌کند
```

جزئیات کامل: [`docs/ENCRYPTION.md`](docs/ENCRYPTION.md)

### 🛠️ توسعه

```bash
git clone https://github.com/MatinMHF/najva-messenger.git
cd najva-messenger
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### 📋 متغیرهای محیطی مهم

| متغیر | توضیح |
|---|---|
| `JWT_SECRET` | کلید امضای access token (حداقل 32 بایت تصادفی) |
| `JWT_REFRESH_SECRET` | کلید امضای refresh token |
| `POSTGRES_PASSWORD` | رمزعبور دیتابیس |
| `TURN_SECRET` | کلید مشترک سرور TURN |
| `MEDIASOUP_ANNOUNCED_IP` | IP عمومی سرور (برای production) |

---

<!-- ══════════════════════════════════════════════════════════════════ -->
<!-- ═══════════════════════  ENGLISH  ══════════════════════════════ -->
<!-- ══════════════════════════════════════════════════════════════════ -->

## 🇬🇧 Najva — Secure Self-Hosted Messenger

Najva (نجوا, Persian for *whisper*) is a fully self-hosted, **end-to-end encrypted** messaging platform. Every message, file, and attachment is encrypted on the client before it ever reaches the server — the server sees only ciphertext.

### ✨ Features

| Category | Feature |
|---|---|
| 💬 **Messaging** | Real-time text, file, voice & video messages |
| 🔐 **Security** | Client-side E2EE (AES-256-GCM + X25519 sealed box) |
| 📞 **Calls** | WebRTC voice & video via mediasoup SFU |
| 👥 **Conversations** | Direct, Group, Channel, Saved Messages |
| 🔑 **Auth** | Password + TOTP 2FA + Passkey (WebAuthn) |
| 🔄 **Recovery** | Recovery codes, passkey PRF, device-to-device transfer |
| 🌐 **i18n** | Persian (فارسی) & English, RTL/LTR aware |
| 🎨 **Themes** | Dark and Light mode |
| 👤 **Admin** | User management, support ticket system |

### 🚀 Quick Install — No Source Download Needed

> Only Docker is required on your machine.

#### 🐧 Linux / macOS

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install/install-linux.sh)
```

The script will automatically:
- Install Docker if missing (supports Debian/Ubuntu, RHEL/Fedora, Arch)
- Generate cryptographically random secrets in `.env`
- Build and start all services
- Open `http://localhost` in your browser

#### 🪟 Windows (PowerShell as Administrator)

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; `
irm https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install/install-windows.ps1 | iex
```

The script will automatically:
- Install Docker Desktop via winget
- Generate secure random secrets in `.env`
- Build and launch all services

#### 🐳 Manual Install (any OS)

```bash
# Download only the config files — no full clone needed
mkdir najva && cd najva
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/.env.example  -o .env
mkdir -p nginx turn
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/nginx/nginx.conf -o nginx/nginx.conf
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/turn/turnserver.conf -o turn/turnserver.conf

# Edit .env — set strong secrets for JWT_SECRET, JWT_REFRESH_SECRET,
# POSTGRES_PASSWORD, TURN_SECRET, and MEDIASOUP_ANNOUNCED_IP (your server IP)

docker compose up -d
# Open http://localhost
```

### 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│              Clients (React 19)              │
└──────────────────────┬──────────────────────┘
                       │ HTTPS / WSS
┌──────────────────────▼──────────────────────┐
│             Nginx Reverse Proxy              │
└───────┬──────────────────────────┬──────────┘
        │                          │
┌───────▼───────┐      ┌───────────▼───────────┐
│  Client App   │      │   Server (Node.js)     │
│  (Static)     │      │   Express + Socket.IO  │
└───────────────┘      └──────────┬─────────────┘
                                  │
               ┌──────────────────┼───────────────┐
               │                  │               │
        ┌──────▼──────┐   ┌───────▼───┐  ┌────────▼──────────┐
        │ PostgreSQL  │   │   Redis   │  │  Media Server     │
        │     16      │   │     7     │  │  mediasoup + TURN │
        └─────────────┘   └───────────┘  └───────────────────┘
```

### 🔐 Security — Key Hierarchy

```
password ──PBKDF2-SHA256 (600k iters)──▶ PRK
   ├── HKDF → KEK   (never leaves the client)
   └── HKDF → loginKey (bcrypt'd on server)

Master Key (MK, 32B random, per user)
   ├── AES-256-GCM wrapped by KEK  → stored server-side
   ├── AES-256-GCM wrapped by Recovery Key (×8 codes)
   ├── AES-256-GCM wrapped by Passkey PRF output
   └── encrypts identity keys (X25519 + Ed25519)

Conversation Key (CK, 32B random, per conversation)
   ├── sealed to each member's X25519 public key
   └── AES-256-GCM encrypts all messages & file keys
```

Full threat model and flow details: [`docs/ENCRYPTION.md`](docs/ENCRYPTION.md)

### 🌐 Production Deployment

Open firewall ports:

| Port | Protocol | Service |
|---|---|---|
| 80 | TCP | HTTP (Nginx) |
| 443 | TCP | HTTPS (Nginx) |
| 3478 | TCP/UDP | TURN |
| 5349 | TCP/UDP | TURNS (TLS) |
| 4443 | TCP | mediasoup signalling |
| 2000–2020 | UDP | mediasoup RTC |
| 49152–49200 | UDP | coturn RTP relay |

Set `MEDIASOUP_ANNOUNCED_IP` to your server's public IP in `.env`, then:

```bash
docker compose up --build -d
```

### 🛠️ Development

```bash
git clone https://github.com/MatinMHF/najva-messenger.git
cd najva-messenger
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### 📁 Project Structure

```
najva-messenger/
├── client/              # React 19 + Vite + TypeScript frontend
│   └── src/
│       ├── components/  # UI components (auth, chat, common, layout)
│       ├── lib/crypto/  # E2EE: primitives, ratchet, X3DH, session
│       ├── pages/       # Route-level pages
│       ├── store/       # Zustand state stores
│       └── i18n/        # FA / EN translations
├── server/              # Node.js API + Socket.IO
│   ├── src/             # TypeScript source
│   └── prisma/          # Database schema & migrations
├── media-server/        # mediasoup SFU (WebRTC)
├── nginx/               # Reverse proxy config
├── turn/                # coturn TURN server config
├── docs/                # ENCRYPTION.md design doc
├── install/             # One-click installers
│   ├── install-linux.sh
│   └── install-windows.ps1
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example
```

### 🤝 Contributing

Pull requests are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

### 📄 License

[MIT](LICENSE) © 2026 MatinMHF
