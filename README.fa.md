# نجوا مسنجر 🚀

[English Documentation](README.md)

نجوا یک پیام‌رسان امن و رمزنگاری‌شده سرتاسری (E2EE) با قابلیت تماس صوتی و تصویری و اشتراک‌گذاری فایل است.

---

## 🔒 نصب گواهی SSL و Root CA خودامضا

هنگام نصب نجوا بر روی آدرس IP (بدون دامنه)، سرور به‌طور خودکار یک **Root CA** ایجاد کرده و آن را در آدرس `http://<SERVER_IP>/ca.crt` قرار می‌دهد.

برای رفع خطای عدم اعتبار گواهی (`NET::ERR_CERT_AUTHORITY_INVALID`) و فعال‌سازی دوربین و میکروفون:

### دستور تک‌خطی خودکار پاوارشل (ویندوز)
پاورشل (PowerShell) را باز کرده و دستور زیر را اجرا کنید:
```powershell
Invoke-WebRequest -Uri "http://<SERVER_IP>/ca.crt" -OutFile "$env:TEMP\najva-ca.crt"; Import-Certificate -FilePath "$env:TEMP\najva-ca.crt" -CertStoreLocation Cert:\CurrentUser\Root
```

### نصب دستی در ویندوز
۱. فایل گواهی را از آدرس `http://<SERVER_IP>/ca.crt` دانلود کنید.
۲. روی فایل `najva-ca.crt` دابل کلیک کنید $\rightarrow$ دکمه **Install Certificate...** را بزنید.
۳. گزینه‌ی **Current User** را انتخاب کرده و **Next** را بزنید.
۴. گزینه‌ی **Place all certificates in the following store** را انتخاب کرده و **Browse...** را بزنید.
۵. پوشه‌ی **Trusted Root Certification Authorities** (*مراجع صدور گواهی ریشه معتبر*) را انتخاب کرده و **OK** $\rightarrow$ **Next** $\rightarrow$ **Finish** را بزنید.
۶. مرورگر را مجدداً باز کرده و به آدرس `https://<SERVER_IP>` بروید.

---

## 🔑 مسیر پنل مدیریت (Admin Panel)

- **مسیر پنل مدیریت**: `/admin` (به عنوان مثال `https://<SERVER_IP>/admin`)
- قابل دسترسی برای کاربرانی که دسترسی مدیریت دارند.
