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

## Chạy production trên máy local

Bản production dùng Next.js **standalone** (không dùng `next start`):

```bash
npm run build          # tạo .next/standalone
npm run serve:prod     # stage static/public → migrate PGlite → chạy server
```

`serve:prod` đọc `.env` + `.env.local`, áp migration trước khi mở server (PGlite chỉ cho 1 process), rồi chạy `.next/standalone/server.js` tại `http://localhost:3000`.

Các biến bắt buộc trong `.env`:

| Biến | Ý nghĩa |
|---|---|
| `NEXTAUTH_SECRET` | Khoá mã hoá credential (≥ 32 ký tự). Thiếu là `/api/health` trả 500. |
| `APP_URL` / `NEXTAUTH_URL` | `http://localhost:3000` — dùng để tạo redirect OAuth và metadata MCP. |
| `ADSYNC_MOCK=0` | Gọi API thật của Meta/Google/TikTok thay vì dữ liệu giả. |
| `ADSYNC_INPROC_WORKER=1` | Scheduler chạy trong process server. |
| `MCP_RATE_LIMIT_PER_MIN` | (tuỳ chọn) giới hạn request/phút cho mỗi MCP key, mặc định 240. |

> ⚠️ `NEXTAUTH_SECRET` là khoá mã hoá token của mọi kết nối. **Đổi/rotate secret sẽ làm toàn bộ connection cũ không giải mã được** (lỗi `Unsupported state or unable to authenticate data`) và phải kết nối lại. Hãy backup secret này cùng `.pgdata`.

`serve.mjs` tự bảo vệ: nếu cổng 3000 đang bận thì dừng ngay với thông báo rõ (tránh 2 process cùng mở PGlite), và nếu tiến trình server con chết bất thường thì tự khởi động lại (tối đa 5 lần, backoff 3→30s).

### Tự chạy khi đăng nhập Windows

Cách không cần quyền admin (đang dùng): shortcut trong Startup folder

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AdsSync.lnk
  → D:\ADS MCP APP\scripts\start-adsync.cmd
  → node scripts\serve.mjs
```

Nếu muốn dùng Task Scheduler (cần quyền admin để tạo trigger) thì trỏ action về cùng script:

```powershell
$a = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" `
  -Argument "`"D:\ADS MCP APP\scripts\serve.mjs`"" -WorkingDirectory "D:\ADS MCP APP"
$t = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "AdsSyncServer" -Action $a -Trigger $t -Force
```

Đừng bật cả hai cùng lúc — chỉ một tiến trình được giữ cổng 3000 và mở `.pgdata`.

Sau khi build lại code, dừng tiến trình cũ rồi chạy lại (`serve.mjs` tự stage lại file tĩnh mỗi lần khởi động).

### Kiểm tra sau khi chạy

```bash
curl http://localhost:3000/api/health
node scripts/verify_mcp.mjs                 # discovery + 401 + health
MCP_KEY=mk_... node scripts/verify_mcp.mjs  # + initialize / tools/list / tools/call
```

---

## Cấp quyền cho AI khác dùng AdsSync (MCP)

Vào **Biz → MCP Keys**:

1. **Tạo key** — chọn nền tảng (Meta, Google Ads, TikTok, Search Console, GA4, Clarity), mức quyền (`Chỉ đọc` / `Toàn quyền` / `Tắt`), bộ chỉ số và skill.
2. **ChatGPT** dùng OAuth: dán `http://localhost:3000/mcp` vào connector; AdsSync tự công bố metadata tại `/.well-known/oauth-authorization-server` và màn hình duyệt key.
3. **Claude Desktop / Cursor** dùng API key: copy JSON cấu hình (hoặc URL `http://localhost:3000/mcp?key=mk_...`).
4. **Kiểm tra key** trong menu ⋯ để xác nhận key còn sống và xem agent sẽ thấy bao nhiêu tool.

Mọi lệnh ghi (tắt ads, đổi ngân sách, đăng bài) vẫn đi qua **Approval Gate** — AI chỉ tạo yêu cầu, bạn bấm duyệt trong tab *Chờ duyệt*.

### Kết nối dữ liệu

| Nền tảng | Cách kết nối | Quyền tối thiểu |
|---|---|---|
| Meta Ads / Page | OAuth Facebook | `ads_read`, `pages_read_engagement`, `read_insights` |
| Google Ads | OAuth Google + `GOOGLE_ADS_DEVELOPER_TOKEN` | `adwords` |
| Google Search Console | OAuth Google (`provider=search_console`) | `webmasters.readonly` |
| Google Analytics 4 | OAuth Google (`provider=ga4`) | `analytics.readonly` |
| Microsoft Clarity | API token (Settings → Data Export) | token project |

Clarity chỉ trả 1–3 ngày gần nhất và tối đa **10 request/ngày**; AdsSync cache kết quả 3 giờ trong connection để tiết kiệm quota.

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
