# Najva Messenger 🚀

[Farsi Documentation (راهنمای فارسی)](README.fa.md)

Najva is a secure, end-to-end encrypted real-time messaging, audio/video calling, and media sharing platform built with React, Node.js, WebSockets, and WebRTC.

---

## 🔒 Self-Signed SSL Certificate Installation

When deploying Najva over an IP address (without a custom domain), Najva automatically generates a **Self-Signed Root CA** and serves it at `http://<YOUR_SERVER_IP>/ca.crt`.

To trust the certificate on client devices and enable camera, microphone, and E2EE audio/video calls:

### Automated 1-Line PowerShell Command (Windows)
Open **PowerShell** and run:
```powershell
Invoke-WebRequest -Uri "http://<YOUR_SERVER_IP>/ca.crt" -OutFile "$env:TEMP\najva-ca.crt"; Import-Certificate -FilePath "$env:TEMP\najva-ca.crt" -CertStoreLocation Cert:\CurrentUser\Root
```

### Manual Installation (Windows GUI)
1. Download the certificate from `http://<YOUR_SERVER_IP>/ca.crt`.
2. Double-click `najva-ca.crt` $\rightarrow$ Click **Install Certificate...**.
3. Select **Current User** $\rightarrow$ Click **Next**.
4. Choose **Place all certificates in the following store** $\rightarrow$ Click **Browse...**.
5. Select **Trusted Root Certification Authorities** $\rightarrow$ Click **OK** $\rightarrow$ **Next** $\rightarrow$ **Finish**.
6. Restart your browser and navigate to `https://<YOUR_SERVER_IP>`.

---

## 🔑 Admin Panel Access

- **Admin Panel Path**: `/admin` (e.g. `https://<YOUR_SERVER_IP>/admin`)
- Accessible by users registered with administrator privileges.
