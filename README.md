# Najva Messenger 🚀

<p align="center">
  <img src="client/public/logo.webp" alt="Najva Logo" width="120" />
</p>

<p align="center">
  <b>A Self-Hosted, Open-Source, End-to-End Encrypted Real-Time Messaging & Voice/Video Calling Platform</b>
</p>

<p align="center">
  <a href="https://github.com/MatinMHF/najva-messenger/releases"><img src="https://img.shields.io/github/v/release/MatinMHF/najva-messenger?style=flat-shadow&color=1e8a96" alt="Release"></a>
  <a href="https://github.com/MatinMHF/najva-messenger/blob/main/LICENSE"><img src="https://img.shields.io/github/license/MatinMHF/najva-messenger?style=flat-shadow&color=14707c" alt="License"></a>
  <img src="https://img.shields.io/badge/Security-E2EE-0e4f58?style=flat-shadow" alt="Security E2EE">
  <img src="https://img.shields.io/badge/Docker-Supported-2496ed?style=flat-shadow" alt="Docker">
  <a href="README.fa.md"><img src="https://img.shields.io/badge/Language-%D9%81%D8%A7%D8%B1%D8%B3%DB%8C-e08c0b?style=flat-shadow" alt="Farsi"></a>
</p>

<p align="center">
  <b>English</b> | <a href="README.fa.md">راهنمای فارسی</a>
</p>

---

## 🌟 Overview

**Najva Messenger** is a self-hosted, open-source communication platform engineered for complete privacy, zero-knowledge encryption, and high-performance real-time communication. All messages, voice notes, video messages, and file attachments are encrypted **client-side in the browser** before ever reaching the server.

Najva includes end-to-end encrypted messaging, crystal-clear 1-on-1 and group voice/video calls (powered by **mediasoup SFU**), custom STUN/TURN relaying (**coturn**), responsive PWA frontend, and an integrated **Admin Panel**.

---

## ✨ Features

- 🔒 **Zero-Knowledge E2E Encryption**: Messages & files are encrypted locally with WebCrypto (AES-GCM-256). The server never holds decryption keys.
- 🎙️ **Voice & Video Calling**: Low-latency 1-on-1 and group calling via WebRTC and a dedicated SFU (`mediasoup`).
- 🔊 **Voice & Video Messages**: Dedicated voice waveform player and video message recording/playback.
- 📁 **Encrypted File Sharing**: Files are encrypted chunk-by-chunk on the client side before upload.
- 📌 **Pinned Messages & Replies**: Pin important messages, reply in threads, copy text, or multi-select messages via drag / long-press.
- 👑 **Built-in Admin Panel (`/admin`)**: Monitor server performance, manage registered users, manage storage quotas, and handle support tickets.
- 🌐 **Dual-Language & RTL**: Out-of-the-box support for English and Farsi with full Right-to-Left (RTL) layout.
- 🛠️ **Automated SSL Management**: Automated Let's Encrypt SSL issuing or automated **Self-Signed Root CA** generation with public download (`/ca.crt`).

---

## 🏗️ Architecture & Services

Najva runs as a 5-container microservice architecture managed by Docker Compose:

| Service | Technology | Description |
| :--- | :--- | :--- |
| `client` | React + Vite + PWA | Modern SPA interface, WebCrypto encryption engine, offline queue, and RTL UI. |
| `server` | Node.js + Express + Prisma | REST API, Socket.IO real-time engine, PostgreSQL database ORM, and Auth manager. |
| `media-server` | mediasoup SFU | High-performance WebRTC Selective Forwarding Unit for multi-party audio/video calls. |
| `turn` | coturn | Dedicated STUN/TURN server for NAT traversal and firewall bypass. |
| `nginx` | Nginx | Reverse proxy, TLS/SSL termination, WebSocket routing, and static `/ca.crt` file distribution. |

---

## 🔌 Network Ports & Firewall Configuration

Ensure the following ports are open on your server firewall:

| Port | Protocol | Usage | Description |
| :--- | :--- | :--- | :--- |
| `80` | TCP | HTTP | Nginx HTTP entry point & Let's Encrypt challenge / CA download (`/ca.crt`). |
| `443` | TCP | HTTPS | Nginx secure HTTPS entry point & WebSocket proxy (`wss://`). |
| `3478` | TCP / UDP | STUN / TURN | TURN server primary listening port. |
| `5349` | TCP / UDP | TURNS | TURN server secure TLS listening port. |
| `40000-49999` | UDP | WebRTC | mediasoup SFU & TURN media relay dynamic port range. |

---

## 🚀 One-Line Installation (Ubuntu 24.04 LTS)

Run the automated installer command on a fresh Ubuntu server:

```bash
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install.sh | sudo bash
```

### Installation Steps & Prompts
The installer clones Najva into `/opt/najva`, generates cryptographic secrets, and prompts for:
1. **HTTP Port** (default: `80`)
2. **HTTPS Port** (default: `443`)
3. **Administrator Credentials** (username & password for `/admin`)
4. **Domain Name** (optional — leave blank for IP deployment with Self-Signed SSL)

Upon completion, access the application at:
- **Application URL**: `http://<YOUR_SERVER_IP>` or `https://<YOUR_SERVER_IP>`
- **Admin Panel URL**: `https://<YOUR_SERVER_IP>/admin`

---

## 🔒 Self-Signed SSL Certificate & HTTPS Setup Guide

Modern web browsers require an **HTTPS** connection for WebCrypto, Microphone, and Camera access. When deployed on an IP address without a domain, Najva automatically generates a **Self-Signed Root CA** and serves it at:

```
http://<YOUR_SERVER_IP>/ca.crt
```

### Client Installation Guide (To Fix `NET::ERR_CERT_AUTHORITY_INVALID`)

#### 1. Automated 1-Line PowerShell Command (Windows)
Open **PowerShell** on your Windows client machine and run (replace `<SERVER_IP>` with your IP):

```powershell
Invoke-WebRequest -Uri "http://<SERVER_IP>/ca.crt" -OutFile "$env:TEMP\najva-ca.crt"; Import-Certificate -FilePath "$env:TEMP\najva-ca.crt" -CertStoreLocation Cert:\CurrentUser\Root
```
*Restart Chrome/Edge after running this command.*

#### 2. Manual Windows GUI Installation
1. Open `http://<SERVER_IP>/ca.crt` to download `najva-ca.crt`.
2. Double-click `najva-ca.crt` $\rightarrow$ Click **Install Certificate...**.
3. Choose **Current User** $\rightarrow$ Click **Next**.
4. Select **Place all certificates in the following store** $\rightarrow$ Click **Browse...**.
5. Select **Trusted Root Certification Authorities** (*مراجع صدور گواهی ریشه معتبر*) $\rightarrow$ Click **OK**.
6. Click **Next** $\rightarrow$ **Finish** $\rightarrow$ Confirm Windows prompt with **Yes**.
7. Restart your browser and navigate to `https://<SERVER_IP>`.

#### 3. Mobile Devices (Android / iOS)
- **Android**: Go to **Settings** $\rightarrow$ **Security** $\rightarrow$ **Encryption & Credentials** $\rightarrow$ **Install a certificate** $\rightarrow$ **CA certificate**, then select `najva-ca.crt`.
- **iOS / iPadOS**: Open Safari $\rightarrow$ Download `http://<SERVER_IP>/ca.crt` $\rightarrow$ Open **Settings** $\rightarrow$ **Profile Downloaded** $\rightarrow$ **Install**. Then go to **Settings** $\rightarrow$ **General** $\rightarrow$ **About** $\rightarrow$ **Certificate Trust Settings** and enable **Full Trust** for Najva Root CA.

#### ⚡ Quick Chrome/Edge Bypass (For Testing)
When viewing the red security warning in Chrome or Edge, click anywhere on the page and type:
```
thisisunsafe
```

---

## 💻 Windows Local Installation

To run Najva locally on Windows, open **PowerShell as Administrator** and execute:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
irm https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install/install-windows.ps1 | iex
```

- **Local App URL**: `http://localhost`
- **Local Admin Panel**: `http://localhost/admin`

---

## ⚙️ Server Management CLI (`sudo najva`)

Manage your deployment anytime by executing:

```bash
sudo najva
```

### Available Management Options:
1. **Retry Let's Encrypt SSL**: Re-issue production SSL certificates via Certbot.
2. **Issue Self-Signed SSL**: Re-generate Self-Signed Root CA & Server certs with `/ca.crt` public link.
3. **Reset Administrator Password**: Re-create admin credentials without losing chat data.
4. **Restart Services**: Execute `docker compose restart`.
5. **Stop Services**: Execute `docker compose down`.
6. **Start Services**: Execute `docker compose up -d`.
7. **System Status**: Display status of Docker containers, domain, and active ports.
8. **View Logs**: Stream live Docker container logs.
9. **Check for Updates**: Compare local version with main branch and auto-update.
10. **Complete Uninstallation**: Wipe containers, databases, and configuration files cleanly.

---

## 🗑️ Uninstallation & Removal

To cleanly uninstall Najva Messenger and remove all Docker containers, networks, and databases:

```bash
# Option 1: Via Management Menu
sudo najva   # Select Option 10

# Option 2: Direct Script Execution
sudo bash /opt/najva/scripts/uninstall.sh
```

---

## 🔑 Admin Panel Access

- **URL Path**: `/admin` (e.g. `https://<YOUR_SERVER_IP>/admin`)
- **Features**: User account management, role assignment, storage disk quota monitoring, live system metrics, and support ticket management.

---

## 💻 Local Development

Clone the repository and spin up the development environment:

```bash
git clone https://github.com/MatinMHF/najva-messenger.git
cd najva-messenger
cp .env.example .env
docker compose -f docker-compose.dev.yml up
```

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
