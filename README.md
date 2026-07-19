# najva-messenger: Self-Hosted End-to-End Encrypted Messaging

**English** · [فارسی](#najva-messenger--پیامرسان-رمزنگاریشده-خودمیزبان)

This project provides a complete messaging platform — chat, voice and video calls, file sharing and push notifications — that runs entirely on a server you control. Messages are encrypted on the client and the server never holds a key capable of reading them.

## Key Capabilities

The platform is built from five services that come up together under Docker Compose:

- **Client**: React and Vite single-page app with a service worker, offline message queue, light and dark themes, and English/Persian localisation including full RTL layout
- **Server**: Node.js and Express API backed by PostgreSQL through Prisma, with Redis for presence and Socket.IO for realtime delivery
- **Media server**: mediasoup SFU handling one-to-one and group audio/video calls, paired with a coturn TURN server for clients behind restrictive networks
- **Nginx**: single entry point terminating TLS and proxying the API, WebSocket and static traffic
- **Admin surface**: user management, storage quotas, support tickets and instance statistics, reachable from the same web app

## Encryption Model

Every message is sealed with a per-conversation key that only participants hold. That key is wrapped by each member's account key, which in turn derives from a key-encryption key computed from the account password — the server stores only the wrapped blobs and the login verifier. Attachments are encrypted before upload, so uploaded files are opaque on disk. Passkey PRF is supported as a second unwrap path for account recovery, and identity fingerprints let two people verify each other out of band. `docs/ENCRYPTION.md` covers the key hierarchy in detail.

Because the password is what derives the key material, a lost password cannot be reset server-side without discarding the account's history. This is a deliberate consequence of the design rather than a missing feature.

## Installation

Ubuntu 24.04 with a public IP is the supported target. The installer collects everything it needs interactively, so a single command is enough:

```bash
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install.sh | sudo bash
```

It installs Docker if absent, clones the project into `/opt/najva`, generates every secret in the environment file at random, and asks four questions:

- **Ports** — press Enter to accept the defaults of 80 and 443
- **Admin username and password** — used to seed the first account
- **Domain** — leave it blank if you do not have one, and the instance is served over plain HTTP on its IP address
- **Let's Encrypt email** — only when a domain was given

With a domain, certbot issues a certificate in standalone mode and Nginx is regenerated with an HTTPS server block and an HTTP redirect. Renewal runs from certbot's own timer and reloads Nginx in place. If issuance fails — DNS not yet propagated, port 80 blocked — the install still completes over HTTP and the certificate can be retried later.

## Management

The installer places a `najva` command on the server. Running it opens a menu covering the operations that matter after the first boot:

```
1) Retry SSL certificate
2) Reset admin username and password
3) Restart the service
4) Stop the service
5) Start the service
6) Status
7) Logs
```

Retrying the certificate also accepts a domain if the instance was installed without one, updating the environment, TURN realm and Nginx configuration in a single step. Resetting the admin credentials re-provisions the account rather than rotating the password in place, for the reason described under the encryption model; the menu asks for confirmation first.

## Working on it Locally

```bash
git clone https://github.com/MatinMHF/najva-messenger.git
cd najva-messenger
cp .env.example .env
docker compose -f docker-compose.dev.yml up
```

The development compose file mounts the sources and runs both the API and the Vite dev server with hot reload. Test suites live alongside the code in `server/src/__tests__` and `client/src/**/__tests__`, and run with `npm test` in either directory. Note that the development images bake their dependencies, so rebuild the image after adding an npm package.

## Configuration

All runtime configuration is read from a single `.env` file at the repository root, written by the installer and documented by `.env.example`. The values worth knowing about are the database and Redis URLs, the four independent signing secrets, the TURN shared secret — which must match `static-auth-secret` in `turn/turnserver.conf` — the VAPID keypair used for Web Push, and the public origin, which feeds CORS, WebAuthn and the media server's advertised URL alike.

## Further Documentation

- `docs/ENCRYPTION.md` — key hierarchy, message envelope format and recovery flows
- `docs/CALLS.md` — signalling, SFU topology and TURN credential minting
- `docs/NOTIFICATIONS.md` — Web Push, delivery adapters and battery considerations

---

# najva-messenger — پیام‌رسان رمزنگاری‌شده خودمیزبان

[English](#najva-messenger-self-hosted-end-to-end-encrypted-messaging) · **فارسی**

این پروژه یک بستر کامل پیام‌رسانی است — گفت‌وگو، تماس صوتی و تصویری، اشتراک فایل و اعلان‌های فوری — که تماماً روی سروری اجرا می‌شود که خودتان در اختیار دارید. پیام‌ها روی دستگاه کاربر رمزنگاری می‌شوند و سرور هیچ‌گاه کلیدی که بتواند آن‌ها را بخواند در اختیار ندارد.

## قابلیت‌های اصلی

این بستر از پنج سرویس ساخته شده که با Docker Compose با هم بالا می‌آیند:

- **کلاینت**: برنامه تک‌صفحه‌ای React و Vite همراه با service worker، صف پیام آفلاین، پوسته روشن و تیره، و بومی‌سازی انگلیسی/فارسی با چیدمان کامل راست‌به‌چپ
- **سرور**: API مبتنی بر Node.js و Express که با Prisma به PostgreSQL متصل است، Redis برای وضعیت حضور و Socket.IO برای تحویل بی‌درنگ
- **سرور رسانه**: mediasoup به‌عنوان SFU برای تماس‌های صوتی و تصویری دونفره و گروهی، به همراه سرور TURN مبتنی بر coturn برای کاربرانی که پشت شبکه‌های محدودکننده هستند
- **Nginx**: تنها نقطه ورود که TLS را پایان می‌دهد و ترافیک API، WebSocket و فایل‌های ایستا را پراکسی می‌کند
- **بخش مدیریت**: مدیریت کاربران، سهمیه فضای ذخیره‌سازی، تیکت‌های پشتیبانی و آمار سرویس، از دل همان برنامه وب

## مدل رمزنگاری

هر پیام با کلید مخصوص همان گفت‌وگو مهر می‌شود؛ کلیدی که تنها در اختیار شرکت‌کنندگان است. این کلید با کلید حساب هر عضو بسته‌بندی می‌شود و آن کلید نیز از یک کلیدِ رمزگذاریِ کلید مشتق می‌شود که خودش از گذرواژه حساب به دست می‌آید — سرور تنها بسته‌های رمزشده و تأییدکننده ورود را نگه می‌دارد. پیوست‌ها پیش از آپلود رمزنگاری می‌شوند، بنابراین فایل‌های ذخیره‌شده روی دیسک ناخوانا هستند. Passkey PRF به‌عنوان مسیر دوم بازگشایی برای بازیابی حساب پشتیبانی می‌شود و اثر انگشت هویتی امکان تأیید دوطرفه از مسیری بیرونی را می‌دهد. جزئیات سلسله‌مراتب کلیدها در `docs/ENCRYPTION.md` آمده است.

از آنجا که گذرواژه همان چیزی است که کلیدها از آن مشتق می‌شوند، بازنشانی گذرواژه گم‌شده از سمت سرور بدون کنار گذاشتن تاریخچه حساب ممکن نیست. این پیامدِ آگاهانهٔ طراحی است، نه قابلیتی که جا مانده باشد.

## نصب

بستر پشتیبانی‌شده Ubuntu 24.04 با یک IP عمومی است. نصب‌کننده هر چه لازم دارد را به‌صورت تعاملی می‌پرسد، پس یک دستور کافی است:

```bash
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install.sh | sudo bash
```

اگر Docker نصب نباشد آن را نصب می‌کند، پروژه را در `/opt/najva` کلون می‌کند، تمام مقادیر محرمانه فایل محیطی را به‌صورت تصادفی می‌سازد و چهار پرسش می‌پرسد:

- **پورت‌ها** — برای پذیرفتن مقادیر پیش‌فرض ۸۰ و ۴۴۳ کافی است Enter بزنید
- **نام کاربری و گذرواژه مدیر** — برای ساخت نخستین حساب
- **دامنه** — اگر دامنه ندارید خالی بگذارید؛ در این حالت سرویس روی HTTP ساده و روی نشانی IP ارائه می‌شود
- **ایمیل Let's Encrypt** — تنها زمانی که دامنه وارد شده باشد

اگر دامنه بدهید، certbot در حالت standalone گواهی را صادر می‌کند و پیکربندی Nginx با بلوک HTTPS و هدایت از HTTP بازنویسی می‌شود. تمدید گواهی با تایمر خود certbot انجام می‌شود و Nginx را در جا بارگذاری مجدد می‌کند. اگر صدور گواهی شکست بخورد — DNS هنوز منتشر نشده باشد یا پورت ۸۰ بسته باشد — نصب روی HTTP کامل می‌شود و گواهی را می‌توان بعداً دوباره تلاش کرد.

## مدیریت

نصب‌کننده دستور `najva` را روی سرور قرار می‌دهد. اجرای آن منویی باز می‌کند که کارهای مهم پس از نخستین راه‌اندازی را پوشش می‌دهد:

```
1) تلاش دوباره برای گواهی SSL
2) بازنشانی نام کاربری و گذرواژه مدیر
3) راه‌اندازی مجدد سرویس
4) توقف سرویس
5) شروع سرویس
6) وضعیت
7) گزارش‌ها
```

گزینه تلاش دوباره برای گواهی، اگر سرویس بدون دامنه نصب شده باشد، دامنه را هم می‌پذیرد و فایل محیطی، realm سرویس TURN و پیکربندی Nginx را یک‌جا به‌روزرسانی می‌کند. بازنشانی مشخصات مدیر — به همان دلیلی که در بخش مدل رمزنگاری گفته شد — حساب را از نو می‌سازد و گذرواژه را در جای خود تغییر نمی‌دهد؛ منو پیش از انجام آن تأیید می‌گیرد.

## توسعه محلی

```bash
git clone https://github.com/MatinMHF/najva-messenger.git
cd najva-messenger
cp .env.example .env
docker compose -f docker-compose.dev.yml up
```

فایل compose توسعه، کدها را mount می‌کند و هم API و هم سرور توسعه Vite را با بارگذاری داغ اجرا می‌کند. آزمون‌ها کنار خود کد در `server/src/__tests__` و `client/src/**/__tests__` قرار دارند و با `npm test` در هر یک از دو پوشه اجرا می‌شوند. توجه کنید که ایمیج‌های توسعه وابستگی‌ها را درون خود می‌پزند، پس پس از افزودن هر بسته npm باید ایمیج را دوباره بسازید.

## پیکربندی

تمام تنظیمات زمان اجرا از یک فایل `.env` در ریشه مخزن خوانده می‌شود که نصب‌کننده آن را می‌نویسد و `.env.example` مستندش می‌کند. مقادیری که دانستن‌شان ارزش دارد عبارت‌اند از نشانی پایگاه‌داده و Redis، چهار کلید امضای مستقل، کلید مشترک TURN — که باید با `static-auth-secret` در `turn/turnserver.conf` یکسان باشد — جفت‌کلید VAPID برای Web Push، و نشانی عمومی سرویس که هم‌زمان به CORS، WebAuthn و نشانی اعلام‌شده سرور رسانه خورانده می‌شود.

## مستندات بیشتر

- `docs/ENCRYPTION.md` — سلسله‌مراتب کلیدها، قالب پاکت پیام و مسیرهای بازیابی
- `docs/CALLS.md` — سیگنالینگ، توپولوژی SFU و ساخت اعتبارنامه TURN
- `docs/NOTIFICATIONS.md` — Web Push، آداپترهای تحویل و ملاحظات مصرف باتری
