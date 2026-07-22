# Najva Messenger 🚀

[راهنمای فارسی (Farsi Documentation)](README.fa.md)

Najva is an advanced, secure, end-to-end encrypted real-time messaging, audio/video calling, and media sharing platform built with React, Node.js, WebSockets, and WebRTC.

---

## 🔒 Self-Signed SSL Certificate & HTTPS Installation Guide

Modern browsers (Google Chrome, Microsoft Edge, Firefox, and Safari) enforce strict security protocols and require an **HTTPS** connection for features like **Microphone**, **Camera**, **Voice Messages**, **Audio/Video Calls**, and **WebCrypto**.

When deploying Najva over a local or public IP address without a domain name, Najva automatically issues a **Self-Signed Root CA** and serves the root certificate file at:

```
http://<SERVER_IP>/ca.crt
```

---

### 🛠️ Client Certificate Installation Steps

To resolve the `NET::ERR_CERT_AUTHORITY_INVALID` warning and grant microphone/camera permissions:

#### 1. Automated 1-Line PowerShell Command (Windows)
Open **PowerShell** on your Windows client machine and run (replace `<SERVER_IP>` with your server's IP address):

```powershell
Invoke-WebRequest -Uri "http://<SERVER_IP>/ca.crt" -OutFile "$env:TEMP\najva-ca.crt"; Import-Certificate -FilePath "$env:TEMP\najva-ca.crt" -CertStoreLocation Cert:\CurrentUser\Root
```

Reopen your browser and navigate to `https://<SERVER_IP>`.

---

#### 2. Manual Installation (Windows GUI)
1. Open `http://<SERVER_IP>/ca.crt` to download `najva-ca.crt`.
2. Double-click `najva-ca.crt` $\rightarrow$ Click **Install Certificate...**.
3. Choose **Current User** $\rightarrow$ Click **Next**.
4. Select **Place all certificates in the following store** $\rightarrow$ Click **Browse...**.
5. Choose **Trusted Root Certification Authorities** $\rightarrow$ Click **OK**.
6. Click **Next** $\rightarrow$ **Finish** $\rightarrow$ Confirm Windows prompt with **Yes**.
7. Restart your browser and navigate to `https://<SERVER_IP>`.

---

#### 3. Mobile Devices (Android / iOS)
- **Android**: Go to **Settings** $\rightarrow$ **Security** $\rightarrow$ **Encryption & Credentials** $\rightarrow$ **Install a certificate** $\rightarrow$ **CA certificate**, then select `najva-ca.crt`.
- **iOS / iPadOS**: Download via Safari $\rightarrow$ Open **Settings** $\rightarrow$ **Profile Downloaded** $\rightarrow$ **Install**. Then go to **Settings** $\rightarrow$ **General** $\rightarrow$ **About** $\rightarrow$ **Certificate Trust Settings** and enable **Full Trust** for Najva Root CA.

---

#### ⚡ Quick Chrome/Edge Bypass (For Testing)
When viewing the red security warning in Chrome or Edge, click anywhere on the page and type:
```
thisisunsafe
```
Chrome will immediately bypass the warning.

---

## 🔑 Admin Panel Access

- **Admin Panel URL**: `/admin` (e.g. `https://<SERVER_IP>/admin`)
- Accessible by accounts created with Administrator privileges.

---

## 💻 Server CLI Menu (`sudo najva`)

Run `sudo najva` on your Ubuntu server to manage services, issue SSL certificates, inspect logs, and pull updates.
