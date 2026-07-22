<p align="center">
  <img src="client/public/logo.webp" alt="Najva Logo" width="120" />
</p>

<p align="center">
  <b>پیام‌رسان خود-میزبان، متن‌باز و کاملاً رمزنگاری‌شده سرتاسری (End-to-End Encrypted) — چت، تماس صوتی و تصویری، اشتراک‌گذاری فایل و پنل مدیریت</b>
</p>

<p align="center">
  <a href="https://github.com/MatinMHF/najva-messenger/releases"><img src="https://img.shields.io/github/v/release/MatinMHF/najva-messenger?style=flat-shadow&color=1e8a96" alt="Release"></a>
  <a href="https://github.com/MatinMHF/najva-messenger/blob/main/LICENSE"><img src="https://img.shields.io/github/license/MatinMHF/najva-messenger?style=flat-shadow&color=14707c" alt="License"></a>
  <img src="https://img.shields.io/badge/Security-E2EE-0e4f58?style=flat-shadow" alt="Security E2EE">
  <img src="https://img.shields.io/badge/Docker-Supported-2496ed?style=flat-shadow" alt="Docker">
  <a href="README.md"><img src="https://img.shields.io/badge/Language-English-17808d?style=flat-shadow" alt="English"></a>
</p>

<div dir="rtl">

<p align="center">
  <a href="README.md">English Documentation</a> | <b>راهنمای فارسی</b>
</p>

---

## 🌟 معرفی پروژه

**نجوا مسنجر (Najva Messenger)** یک پیام‌رسان خود-میزبان، متن‌باز و فوق‌العاده امن است که با هدف حفظ کامل حریم خصوصی و عدم دسترسی سرور به داده‌های کاربران توسعه یافته است. در نجوا، تمامی پیام‌ها، پیام‌های صوتی، ویدیوها و فایل‌های ضمیمه **پیش از خروج از مرورگر کاربر** و به صورت سرتاسری (Client-Side E2EE) رمزنگاری می‌شوند.

نجوا علاوه بر چت متنی و اشتراک فایل، مجهز به سیستم **تماس صوتی و تصویری با کیفیت بالا** (مبتنی بر سرور اختصاصی SFU mediasoup)، سرور اختصاصی TURN/STUN (coturn)، پنل مدیریت پیشرفته (`/admin`) و رابط کاربری دو زبانه (فارسی/انگلیسی) با پشتیبانی کامل از RTL است.

---

## ✨ قابلیت‌ها و ویژگی‌ها

- 🔒 **رمزنگاری سرتاسری واقعی (E2EE)**: رمزنگاری کلیه پیام‌ها و فایل‌ها در سمت کاربر با استاندارد WebCrypto (AES-GCM-256). سرور تنها داده‌های رمزنگاری‌شده را ذخیره می‌کند و هیچ کلیدی برای خواندن آن‌ها ندارد.
- 📞 **تماس صوتی و تصویری دو‌نفره و گروهی**: ارتباط با کیفیت و تاخیر کم با استفاده از سرور اختصاصی SFU (`mediasoup`) و WebRTC.
- 🎙️ **پیام صوتی و تصویری (Voice & Video Messages)**: پخش‌کننده صوتی اختصاصی با موج صدا و ضبط و پخش پیام‌های ویدیویی.
- 📁 **اشتراک‌گذاری فایل رمزنگاری‌شده**: رمزنگاری تکه‌تکه (Chunked Encryption) فایل‌ها پیش از آپلود.
- 📌 **پیام‌های سنجاق‌شده (Pin) و پاسخ (Reply)**: سنجاق پیام‌های مهم، پاسخ در رشته گفتگو، کپی متن و انتخاب چندتایی پیام‌ها با کشیدن موس (Drag) یا نگه داشتن (Long-Press).
- 👑 **پنل مدیریت کامل (`/admin`)**: مدیریت کاربران، اعطای دسترسی مدیریت، نظارت بر سهمیه دیسک، آمار زنده سیستم و مدیریت تیکت‌ها.
- 🌐 **پشتیبانی کامل از زبان فارسی و RTL**: طراحی شده با جدیدترین متدهای مدرن UI/UX و هماهنگی کامل با راست‌چین (RTL).
- 🛠️ **مدیریت خودکار SSL/TLS**: دریافت خودکار گواهی Let's Encrypt یا صدور خودکار **Root CA خودامضا** با لینک دانلود عمومی (`/ca.crt`).

---

## 🏗️ معماری و سرویس‌ها

نجوا از ۵ کانتینر ایزوله تشکیل شده که توسط Docker Compose مدیریت می‌شوند:

| سرویس | تکنولوژی | نقش |
| :--- | :--- | :--- |
| `client` | React + Vite + PWA | رابط کاربری، موتور رمزنگاری WebCrypto، صف آفلاین و رابط دو زبانه. |
| `server` | Node.js + Express + Prisma | API اصلی، دیتابیس PostgreSQL، مدیریت Socket.IO و احراز هویت. |
| `media-server` | mediasoup SFU | سرور WebRTC با کارایی بالا برای مدیریت تماس‌های صوتی و تصویری. |
| `turn` | coturn | سرور STUN/TURN برای عبور از NAT و فایروال‌های شبکه. |
| `nginx` | Nginx | نقطه‌ی ورودی واحد، مدیریت TLS/SSL، پروکسی WebSocket و دانلود عمومی `/ca.crt`. |

---

## 🔌 پورت‌های مورد نیاز شبکه و فایروال

برای عملکرد صحیح سرویس‌ها، پورت‌های زیر را روی فایروال سرور باز کنید:

| پورت | پروتکل | کاربرد | توضیحات |
| :--- | :--- | :--- | :--- |
| `80` | TCP | HTTP | ورودی Nginx، تاییدیه Let's Encrypt و دانلود گواهی `/ca.crt`. |
| `443` | TCP | HTTPS | ورودی امن HTTPS و پروکسی WebSocket ها (`wss://`). |
| `3478` | TCP / UDP | STUN / TURN | پورت اصلی سرور TURN. |
| `5349` | TCP / UDP | TURNS | پورت امن TLS سرور TURN. |
| `40000-49999` | UDP | WebRTC | بازه پورت‌های پویا برای انتقال صدای ویدیوی mediasoup و TURN. |

---

## 🚀 نصب با یک دستور (Ubuntu 24.04 LTS)

برای نصب نجوا روی سرور لینوکس خام، دستور زیر را در ترمینال اجرا کنید:

```bash
curl -fsSL https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install.sh | sudo bash
```

### مراحل نصب خودکار
اسکریپت نصب پروژه را در `/opt/najva` کلون کرده، کلیدهای امنیتی را تولید می‌کند و ۴ سوال می‌پرسد:
1. **پورت HTTP** (پیش‌فرض: `80`)
2. **پورت HTTPS** (پیش‌فرض: `443`)
3. **مشخصات مدیر سیستم** (نام کاربری و رمز عبور برای ورود به `/admin`)
4. **دامنه** (اختیاری — در صورت عدم داشتن دامنه و استفاده از IP خالی بگذارید)

پس از پایان موفقیت‌آمیز نصب، آدرس‌های زیر در دسترس خواهند بود:
- **آدرس پیام‌رسان:** `http://<SERVER_IP>` یا `https://<SERVER_IP>`
- **آدرس پنل مدیریت:** `https://<SERVER_IP>/admin`

---

## 🔒 راهنمای جامع نصب گواهی SSL خودامضا (HTTPS)

مرورگرهای جدید دسترسی به **میکروفون**، **دوربین**، **ضبط صدای پیام صوتی**، **تماس صوتی و تصویری** و **توابع رمزنگاری WebCrypto** را تنها در بستر امن **HTTPS** مجاز می‌دانند.

هنگام نصب نجوا روی سرور با آدرس IP مستقیم (بدون دامنه)، گواهی ریشه خودامضا (**Root CA**) به صورت خودکار صادر شده و فایل آن در آدرس زیر برای دانلود قرار می‌گیرد:

```
http://<SERVER_IP>/ca.crt
```

### روش‌های نصب گواهی در دستگاه کاربران (رفع خطای `NET::ERR_CERT_AUTHORITY_INVALID`):

#### ۱. دستور تک‌خطی پاورشل (ویندوز - پیشنهاد شده)
پاورشل (PowerShell) را در ویندوز باز کرده و دستور زیر را اجرا کنید (آدرس IP سرور خود را قرار دهید):

```powershell
Invoke-WebRequest -Uri "http://<SERVER_IP>/ca.crt" -OutFile "$env:TEMP\najva-ca.crt"; Import-Certificate -FilePath "$env:TEMP\najva-ca.crt" -CertStoreLocation Cert:\CurrentUser\Root
```
*پس از اجرای دستور، مرورگر خود را بسته و مجدداً باز کنید.*

#### ۲. روش نصب دستی در ویندوز (Windows GUI)
۱. لینک `http://<SERVER_IP>/ca.crt` را در مرورگر وارد کرده و فایل `najva-ca.crt` را دانلود کنید.
۲. روی فایل دانلود شده دابل کلیک کرده و گزینه **Install Certificate...** را بزنید.
۳. گزینه‌ی **Current User** را انتخاب کرده و دکمه **Next** را بزنید.
۴. گزینه‌ی **Place all certificates in the following store** را انتخاب کرده و دکمه **Browse...** را بزنید.
۵. پوشه‌ی **Trusted Root Certification Authorities** (*مراجع صدور گواهی ریشه معتبر*) را انتخاب کرده و **OK** را بزنید.
۶. دکمه **Next** و سپس **Finish** را بزنید و در پنجره‌ی هشدار ویندوز دکمه **Yes** را انتخاب کنید.
۷. مرورگر را بازنشانی کرده و به آدرس `https://<SERVER_IP>` بروید.

#### ۳. روش نصب در اندروید و آیفون (Android / iOS)
- **اندروید**: به مسیر **Settings** $\rightarrow$ **Security** $\rightarrow$ **Encryption & Credentials** $\rightarrow$ **Install a certificate** $\rightarrow$ **CA certificate** رفته و فایل `najva-ca.crt` را انتخاب کنید.
- **آیفون (iOS)**: فایل `http://<SERVER_IP>/ca.crt` را در Safari باز کنید $\rightarrow$ به **Settings** $\rightarrow$ **Profile Downloaded** $\rightarrow$ **Install** بروید. سپس به **Settings** $\rightarrow$ **General** $\rightarrow$ **About** $\rightarrow$ **Certificate Trust Settings** رفته و سوئیچ **Full Trust** را برای Najva Root CA فعال کنید.

#### ⚡ میانبر سریع کروم/ایج (جهت تست)
در صفحه قرمز هشدار کروم یا ایج، عبارت زیر را روی کیبورد خود تایپ کنید:
```
thisisunsafe
```

---

## 💻 نصب روی ویندوز (اجرای محلی)

برای اجرای محلی Najva در ویندوز، PowerShell را به صورت Administrator باز کرده و دستور زیر را اجرا کنید:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
irm https://raw.githubusercontent.com/MatinMHF/najva-messenger/main/install/install-windows.ps1 | iex
```

- **آدرس برنامه:** `http://localhost`
- **آدرس پنل مدیریت:** `http://localhost/admin`

---

## ⚙️ دستورات مدیریت سرور (`sudo najva`)

پس از نصب، می‌توانید با اجرای دستور زیر در سرور لینوکس، به منوی مدیریت سرویس دسترسی داشته باشید:

```bash
sudo najva
```

### گزینه‌های منوی مدیریت:
1. **تلاش مجدد برای دریافت SSL**: دریافت مجدد گواهی تولیدی از Certbot.
2. **صدور گواهی SSL خودامضا**: تولید مجدد Root CA و فایل `/ca.crt`.
3. **بازنشانی رمز عبور مدیر**: ساخت مجدد حساب مدیر سیستم بدون حذف چت‌ها.
4. **راه‌اندازی مجدد سرویس‌ها**: اجرای `docker compose restart`.
5. **متوقف کردن سرویس‌ها**: اجرای `docker compose down`.
6. **شروع سرویس‌ها**: اجرای `docker compose up -d`.
7. **وضعیت سیستم**: نمایش وضعیت کانتینرها، دامنه و پورت‌ها.
8. **مشاهده لاگ‌ها**: مشاهده زنده لاگ کانتینرها.
9. **بررسی بروزرسانی**: مقایسه نسخه با گیت‌هاب و آپدیت خودکار.
10. **حذف کامل سیستم**: پاکسازی کامل کانتینرها، دیتابیس‌ها و فایل‌ها.

---

## 🗑️ راهنمای حذف کامل (Uninstallation)

برای پاکسازی و حذف کامل نجوا مسنجر و تمام کانتینرها و دیتابیس‌های آن:

```bash
# روش اول: از طریق منوی مدیریت
sudo najva   # انتخاب گزینه ۱۰

# روش دوم: اجرای مستقیم اسکریپت حذف
sudo bash /opt/najva/scripts/uninstall.sh
```

---

## 🔑 پنل مدیریت (Admin Panel)

- **مسیر پنل مدیریت**: `/admin` (به عنوان مثال `https://<SERVER_IP>/admin`)
- **امکانات**: مدیریت حساب‌های کاربری، تعیین سطح دسترسی مدیر، نظارت بر سهمیه دیسک، آمار زنده سیستم و مدیریت تیکت‌های پشتیبانی.

---

## 💻 توسعه محلی (Local Development)

```bash
git clone https://github.com/MatinMHF/najva-messenger.git
cd najva-messenger
cp .env.example .env
docker compose -f docker-compose.dev.yml up
```

---

## 📄 لایسنس

پروژه تحت لایسنس **MIT** منتشر شده است. برای اطلاعات بیشتر فایل [LICENSE](LICENSE) را مطالعه کنید.

</div>
