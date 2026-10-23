# AdsSync — All-In-One Marketing & Growth OS

[![Release](https://img.shields.io/github/v/release/Edeys/ads?label=Desktop%20Release)](https://github.com/Edeys/ads/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8D8)](https://tauri.app/)
[![Local-First](https://img.shields.io/badge/Architecture-Local--First%20%7C%20PGlite-brightgreen)](ARCHITECTURE.md)

Nền tảng **Marketing All-In-One, Tự động hóa tăng trưởng (Growth OS) & Quản trị đa kênh, Self-Hosted & Local-First**: Quản lý chiến dịch quảng cáo (Meta, TikTok, Google), xây dựng cụm chủ đề Topical Authority (Blog/SEO), xuất bản đa nền tảng CMS, tự động hóa nội dung đa kênh, phân bổ doanh thu thực tế Server-Side CAPI, và vận hành trợ lý AI qua giao thức **Model Context Protocol (MCP Server)**.

Chạy được hai kiểu:

- **Web self-host**: Next.js 15 + PGlite WASM (không cần cài PostgreSQL bên ngoài).
- **Desktop**: Tauri 2, dữ liệu nằm trong `%APPDATA%\AdsSync`, tự động cập nhật 1-click qua GitHub Releases.

> Mọi lệnh **ghi** lên tài khoản quảng cáo thật hoặc xuất bản tự động đều đi qua **Approval Gate** (owner duyệt trong app) và mặc định chạy an toàn. Đây là điểm khác biệt cốt lõi so với các công cụ "cho AI toàn quyền".

---

## Tính năng cốt lõi

| Nhóm | Nội dung |
| --- | --- |
| **Content & SEO Hub** | Cụm chủ đề Topic Clusters (Hub & Spoke), bộ tính điểm On-page SEO tức thì, kết nối xuất bản 1-click sang WordPress REST API, Ghost, Webflow & Webhook. |
| **Chỉ số quảng cáo** | 32 chỉ số hợp nhất (13 Meta · 8 TikTok · 6 Google · 5 OpenAI Ads), gộp nhiều TKQC, so sánh kỳ trước theo thời gian thực. |
| **Ads Autopilot** | Luật tự động tắt theo ngưỡng CPA (Stop-loss), tăng/giảm ngân sách theo khung giờ vàng (Surf scaling), cảnh báo mỏi quảng cáo (Creative Fatigue). |
| **Server-Side CAPI** | Webhook tiếp nhận đơn hàng thực tế (Shopify, Pancake, Haravan), mã hóa băm SHA-256 bắn ngược về Meta CAPI & Google Offline Conversions. |
| **MCP Server (AI Hub)**| Endpoint `POST /mcp?key=…` chuẩn OAuth 2.1 + PKCE, cung cấp 27+ marketing tools cho Claude Desktop, Cursor, ChatGPT. |
| **Cập nhật Desktop 1-Click** | Tự động kiểm tra bản phát hành mới qua GitHub Releases, xác thực chữ ký số Minisign, tự động tải và cập nhật không gián đoạn. |
| **Cộng tác & Phân quyền** | Hỗ trợ nhiều Workspace (Biz), 18 quyền hạn chi tiết, lời mời thành viên, nhật ký thao tác (Audit log) 30 ngày. |

---

## Kiến trúc

```
Next.js 15 (App Router, RSC + Route Handlers)
├── UI: Tailwind + Radix primitives + Content Editor
├── DB: PGlite (embedded Postgres WASM) qua Drizzle ORM   → ./.pgdata hoặc %APPDATA%\AdsSync
├── Worker: scheduler chạy TRONG process server (tick 30s · health 15m · social 60s)
├── MCP: /mcp (OAuth 2.1, JSON-RPC, stateless) + Approval Gate
└── Desktop: Tauri 2 shell → spawn Node sidecar chạy Next standalone + Auto-updater (Minisign)
```

> 📖 **Xem chi tiết sơ đồ luồng, phân rã thư mục và thiết kế tại [ARCHITECTURE.md](ARCHITECTURE.md).**

Vì PGlite chỉ cho **một process** mở thư mục dữ liệu, scheduler không chạy thành process riêng. Muốn tách worker độc lập: đặt `DATABASE_URL` trỏ tới Postgres thật rồi chạy `npm run worker`.

---

## Chạy nhanh (Web)

Yêu cầu: Node.js ≥ 20.

```bash
npm install
cp .env.example .env        # điền NEXTAUTH_SECRET (bất kỳ chuỗi dài ≥ 32 ký tự)
npm run db:push             # generate + apply migration vào ./.pgdata
npm run seed                # user dev@local.test + biz my-biz + 3 mẫu quảng cáo
npm run dev                 # http://localhost:3000
```

Đăng nhập dev: `dev@local.test` → vào `/biz/my-biz/dashboard`.

---

## Chạy & Cập nhật Desktop

```bash
npm run desktop:dev        # build standalone + mở cửa sổ app (không cần cài Rust)
```

### Cập nhật phiên bản mới 1-click trên Desktop:
- Vào **Cài đặt Biz** hoặc bấm nút **Cập nhật v0.2.0** ở chân thanh Sidebar.
- Bấm **"Kiểm tra cập nhật"**: App tự động truy vấn GitHub Releases `latest.json`.
- Khi có bản mới: Bấm **"Cài đặt & Khởi động lại"**, ứng dụng sẽ tự động tải bản nén `.nsis.zip`, kiểm tra chữ ký Minisign và cài đặt ngầm.

Bản cài đặt `.exe` cần Rust: xem chi tiết tại [`desktop/README.md`](desktop/README.md).

---

## Đóng góp & Phát triển mã nguồn mở

Dự án phát triển theo mô hình Open-Source Production. Vui lòng đọc:
- [`CONTRIBUTING.md`](CONTRIBUTING.md): Hướng dẫn thiết lập môi trường, quy chuẩn TypeScript và quy trình gửi Pull Request.
- [`SECURITY.md`](SECURITY.md): Chính sách báo cáo lỗ hổng bảo mật và bảo vệ bí mật người dùng.
- [`LICENSE`](LICENSE): Giấy phép phần mềm mã nguồn mở MIT.
