# Chính sách bảo mật (Security Policy)

## 1. Phiên bản được hỗ trợ

| Phiên bản | Được hỗ trợ cập nhật bảo mật |
| --- | --- |
| 0.2.x (Hiện tại) | :white_check_mark: |
| < 0.2.0 | :x: |

---

## 2. Báo cáo lỗ hổng bảo mật (Reporting a Vulnerability)

Chúng tôi coi trọng việc bảo vệ dữ liệu người dùng và các token OAuth (Meta, Google, TikTok). 

Nếu bạn phát hiện bất kỳ lỗ hổng bảo mật nào trong mã nguồn hoặc gói phân phối Desktop:
- **KHÔNG** tạo issue công khai trên GitHub.
- Vui lòng gửi email trực tiếp tới nhóm phát triển qua GitHub Security Advisory hoặc email bảo mật của dự án.
- Cung cấp các bước tái hiện chi tiết (PoC) và tác động dự kiến của lỗ hổng.

Chúng tôi sẽ xác nhận báo cáo trong vòng 48 giờ và phát hành bản vá bảo mật qua hệ thống Auto-Updater trong thời gian sớm nhất.

---

## 3. Kiến trúc bảo vệ bí mật trong AdsSync

- AdsSync tuân thủ mô hình **Local-First**: Mọi token và secret người dùng (`secret.txt`, `oauth.env`) được lưu trữ tại máy cục bộ của người dùng (`%APPDATA%\AdsSync\`) và **không bao giờ** được gửi về bất kỳ máy chủ trung gian nào.
- Các bản cập nhật Desktop Installer được ký số bằng thuật toán mã hóa **Minisign**, bảo vệ người dùng khỏi các cuộc tấn công giả mạo (Man-in-the-middle).
