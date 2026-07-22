# najva-messenger

<p align="center">
  <b>English</b> | <a href="README.fa.md">فارسی</a>
</p>

A self-hosted, open-source, fully end-to-end encrypted messaging suite — text chat, voice and video calling, encrypted file sharing, and real-time push notifications — running entirely on hardware you control.

Messages are encrypted in the browser before ever leaving the client. The server stores only wrapped keys and ciphertexts; it never holds keys to read your data. A single command on a fresh Ubuntu 24.04 server sets up all five services, prompts for four configuration parameters, and issues SSL certificates automatically.

---

## 🔒 Self-Signed SSL Certificate & HTTPS Installation Guide

Modern browsers require an **HTTPS** connection for features like **Microphone**, **Camera**, **Voice Messages**, **Audio/Video Calls**, and **WebCrypto**.

When deploying Najva over an IP address without a domain, Najva automatically generates a **Self-Signed Root CA** and serves it at:
```
http://<SERVER_IP>/ca.crt
```

### Client Root CA Installation Steps (To resolve `NET::ERR_CERT_AUTHORITY_INVALID`):

1. **Automated 1-Line PowerShell Command (Windows)**:
   Open **PowerShell** and run (replace `<SERVER_IP>` with your server IP):
   ```powershell
   Invoke-WebRequest -Uri "http://<SERVER_IP>/ca.crt" -OutFile "$env:TEMP\najva-ca.crt"; Import-Certificate -FilePath "$env:TEMP\najva-ca.crt" -CertStoreLocation Cert:\CurrentUser\Root
   ```
   Reopen your browser and navigate to `https://<SERVER_IP>`.

2. **Manual Windows GUI Installation**:
   - Download `http://<SERVER_IP>/ca.crt`.
   - Double-click `najva-ca.crt` $\rightarrow$ **Install Certificate...** $\rightarrow$ **Current User** $\rightarrow$ **Next**.
   - Select **Place all certificates in the following store** $\rightarrow$ **Browse...** $\rightarrow$ Select **Trusted Root Certification Authorities**.
   - Click **Next** $\rightarrow$ **Finish** $\rightarrow$ **Yes**.

3. **Android & iOS/iPadOS**:
   - **Android**: Go to Settings $\rightarrow$ Security $\rightarrow$ Install a certificate $\rightarrow$ CA certificate and select `najva-ca.crt`.
   - **iOS**: Download via Safari $\rightarrow$ Settings $\rightarrow$ Profile Downloaded $\rightarrow$ Install. Then go to Settings $\rightarrow$ General $\rightarrow$ About $\rightarrow$ Certificate Trust Settings and enable **Full Trust** for Najva Root CA.

4. **Quick Chrome/Edge Bypass**:
   - Click anywhere on the Chrome red warning page and type `thisisunsafe`.

---

## 🔑 Admin Panel Access

- **Admin Panel URL**: `/admin` (e.g. `https://<SERVER_IP>/admin`)
- Accessible by accounts created with Administrator privileges.

---

## 💻 Installation & Quickstart

```bash
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install.sh | sudo bash
```

Run `sudo najva` on your Ubuntu server to manage services, issue SSL certificates, inspect logs, and pull updates.

---

## License

MIT
