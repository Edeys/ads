# Kiến trúc hệ thống AdsSync (Architecture & Project Structure)

AdsSync là nền tảng quản trị quảng cáo đa kênh (Meta, Google, TikTok), tự động hoá chiến dịch (Autopilot), hỗ trợ AI qua giao thức **Model Context Protocol (MCP Server)**, được thiết kế theo triết lý **Local-First, Self-Hosted & Hybrid Desktop**.

---

## 1. Mô hình kiến trúc tổng thể (High-Level Architecture)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ADS-SYNC CLIENT LAYERS                                │
│                                                                             │
│  ┌───────────────────────────────┐     ┌─────────────────────────────────┐  │
│  │   Desktop App (Tauri 2 Rust)   │     │    Web App (Trình duyệt thường) │  │
│  │   - WebView2 Windows shell    │     │    - Next.js Client Components  │  │
│  │   - Auto-updater (Minisign)   │     │    - Responsive Tailwind UI     │  │
│  │   - IPC Bridge (open_external)│     │                                 │  │
│  └───────────────┬───────────────┘     └────────────────┬────────────────┘  │
└──────────────────┼──────────────────────────────────────┼───────────────────┘
                   │  http://127.0.0.1:3210 (Local loop)  │
                   ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CORE SERVER (Next.js 15 Standalone)                      │
│                                                                             │
│  ┌───────────────────────────────┐     ┌─────────────────────────────────┐  │
│  │    App Router (39 Màn hình)   │     │   API Layer (74 Endpoints REST) │  │
│  │  - Dashboard & Báo cáo        │     │  - OAuth Callback & Bridge      │  │
│  │  - Quản lý chiến dịch/CPA     │     │  - Đồng bộ số liệu (Sync)       │  │
│  │  - Cài đặt Biz & Quyền hạn    │     │  - Health, Backup, Webhooks     │  │
│  └───────────────────────────────┘     └─────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────┐     ┌─────────────────────────────────┐  │
│  │  In-Process Background Worker │     │   MCP Server (AI Assistant Hub) │  │
│  │  - Autopilot rules (Auto-pause│     │  - OAuth 2.1 + PKCE             │  │
│  │  - Budget scheduler           │     │  - 27+ Marketing Tools          │  │
│  │  - Social & Comment engine    │     │  - Claude, ChatGPT, Cursor      │  │
│  └───────────────────────────────┘     └─────────────────────────────────┘  │
│                                  │                                          │
│                                  ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │     Data & Safety Engine: Write-Guard + Approval Gate                 │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LOCAL STORAGE LAYER                                │
│                                                                             │
│  - Database: PGlite (PostgreSQL WASM nhúng trong Node process)             │
│  - Vị trí dữ liệu: %APPDATA%\AdsSync\pgdata (Bản desktop) hoặc ./.pgdata     │
│  - Cấu hình & Secret: %APPDATA%\AdsSync\secret.txt, oauth.env, mode.env     │
│  - ORM: Drizzle ORM (schema-first, type-safe SQL migrations)               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Bản đồ cấu trúc thư mục chi tiết (Directory Layout)

```
ADS MCP APP/
├── desktop/                         # Vỏ Desktop Tauri 2 (Rust + Windows)
│   ├── src-tauri/                   # Mã nguồn Rust & cấu hình Tauri
│   │   ├── src/main.rs              # Khởi tạo Node sidecar, migrate DB, quản lý IPC
│   │   ├── build.rs                 # Build script sinh manifest & quyền IPC
│   │   ├── Cargo.toml               # Khai báo crate (tauri, tauri-plugin-updater, serde)
│   │   ├── tauri.conf.json          # Cấu hình bundle NSIS, icon, auto-updater endpoints
│   │   └── capabilities/            # ACL phân quyền IPC cho Webview
│   ├── prepare.mjs                  # Script đóng gói server standalone + PGlite + node.exe
│   ├── bootstrap.mjs                # Script áp migration DB trước khi spawn server
│   ├── dev.ps1                      # Chạy thử bản desktop qua Edge/Chrome app mode (không cần Rust)
│   ├── make-icons.mjs               # Tool tạo icon đa kích thước không phụ thuộc thư viện ngoài
│   ├── make-latest-json.mjs         # Tool tạo manifest cập nhật latest.json cho GitHub Releases
│   └── README.md                    # Tài liệu chi tiết hướng dẫn vận hành bản Desktop
│
├── src/                             # Mã nguồn ứng dụng chính (TypeScript)
│   ├── app/                         # Next.js App Router (UI & API endpoints)
│   │   ├── api/                     # Hệ thống API REST
│   │   │   ├── connect/             # OAuth kết nối nền tảng (Meta, Google Ads, TikTok)
│   │   │   ├── desktop/             # Auth-bridge giúp đăng nhập an toàn trong desktop shell
│   │   │   ├── biz/[slug]/          # API theo từng workspace (chiến dịch, số liệu, cpa, tools...)
│   │   │   ├── self-hosted/         # API cấu hình App ID/Secret cho bản tự vận hành
│   │   │   ├── webhooks/            # Nhận webhook từ Facebook Graph API
│   │   │   └── health/              # Healthcheck và kích hoạt background worker
│   │   ├── biz/[slug]/              # Các trang giao diện workspace
│   │   │   ├── dashboard/           # Tổng quan, chỉ số, báo cáo, kết nối, tự động hoá...
│   │   │   └── settings/            # Cài đặt Biz, thành viên, hoá đơn, OAuth apps, Auto-update
│   │   ├── login/                   # Trang đăng nhập (Google OAuth / ChatGPT OAuth)
│   │   └── mcp/                     # Endpoints phục vụ MCP Server (OAuth 2.1 metadata & token)
│   │
│   ├── db/                          # Tầng Cơ sở dữ liệu (Database Layer)
│   │   ├── schema.ts                # Định nghĩa toàn bộ bảng (users, bizs, campaigns, metrics, mcp...)
│   │   ├── index.ts                 # Kết nối PGlite WASM hoặc Postgres client qua Drizzle
│   │   ├── migrate.ts               # Runner chạy migration Drizzle
│   │   └── seed.ts                  # Dữ liệu khởi tạo mặc định (core & demo)
│   │
│   ├── lib/                         # Thư viện dùng chung & Tích hợp nền tảng
│   │   ├── meta-ads.ts              # SDK tích hợp Facebook Graph API & Quản lý chiến dịch
│   │   ├── google-ads.ts            # SDK gọi Google Ads API v25 & Refresh token
│   │   ├── tiktok-ads.ts            # SDK TikTok Marketing API
│   │   ├── mcp-oauth.ts             # Triển khai OAuth 2.1 + PKCE cho MCP Server
│   │   ├── write-guard.ts           # Lá chắn an toàn: kiểm soát mock/real-write
│   │   ├── open-external.ts         # Tiện ích mở trình duyệt ngoài khi chạy trong Tauri
│   │   ├── use-theme.ts             # Quản lý giao diện sáng/tối (Dark/Light mode)
│   │   └── guard.ts                 # Middleware phân quyền người dùng và kiểm tra vai trò
│   │
│   ├── mcp/                         # Triển khai Model Context Protocol
│   │   ├── server.ts                # Khởi tạo MCP Server, đăng ký 27+ marketing tools
│   │   └── tools/                   # Bộ công cụ cho AI (Meta, Google, TikTok, Pancake)
│   │
│   └── worker/                      # Tiến trình chạy ngầm (Background Worker)
│       ├── index.ts                 # Khởi chạy worker qua BullMQ hoặc In-Process scheduler
│       ├── engine.ts                # Bộ điều phối vòng lặp tick (30s / 60s / 15m)
│       └── jobs/                    # Các tác vụ: autoPause, budgetSchedule, metricsPull, social
│
├── drizzle/                         # Các file SQL migration được sinh tự động
├── public/                          # Tài nguyên tĩnh (ảnh, icon, font)
├── scripts/                         # Script kiểm thử & chẩn đoán tự động
├── .env.example                     # File biến môi trường mẫu (không chứa secret)
├── package.json                     # Quản lý dependencies & npm scripts
└── tailwind.config.ts               # Cấu hình giao diện Tailwind CSS
```

---

## 3. Các cơ chế vận hành đặc thù (Key Design Patterns)

### 3.1. Cơ chế Single-Process PGlite (Local Embedded Database)
- **Đặc tính**: PGlite là Postgres chạy bằng WASM trong tiến trình Node.js. Chỉ duy nhất **1 process** được mở thư mục dữ liệu tại một thời điểm.
- **Giải pháp**:
  - Không chạy tiến trình worker riêng biệt bên ngoài khi dùng PGlite.
  - Sử dụng **In-Process Worker** (`ADSYNC_INPROC_WORKER=1`), tích hợp vòng lặp scheduler chạy ngay bên trong server Next.js.
  - Quá trình migration DB được tách thành file [`desktop/bootstrap.mjs`](file:///D:/ADS%20MCP%20APP/desktop/bootstrap.mjs), chạy và đóng kết nối trước khi server chính spawn.

### 3.2. Cầu nối đăng nhập ngoài (Desktop Auth Bridge)
- **Vấn đề**: Google và Facebook chặn màn hình đăng nhập OAuth nếu chạy trong Webview nhúng của ứng dụng desktop.
- **Giải pháp**:
  - Webview gọi lệnh IPC Rust `open_external` để mở trình duyệt mặc định của hệ điều hành (Chrome/Edge/Brave).
  - Quá trình xác thực diễn ra tại trình duyệt hệ thống. Khi thành công, server NextAuth tạo một phiên làm việc mã hoá một lần (Auth Bridge Token).
  - Webview trong app thăm dò (poll) route `/api/desktop/auth-bridge/status` để nhận cookie phiên cùng origin an toàn và tự động đăng nhập.

### 3.3. Lá chắn an toàn cho lệnh ghi (Write-Guard & Approval Gate)
- Mặc định ứng dụng chạy ở chế độ **`ADSYNC_MOCK=1`**: mọi thao tác ghi (tắt/bật quảng cáo, đổi ngân sách) chỉ được mô phỏng và lưu vào nhật ký kiểm toán (Audit Log).
- Khi kết nối với trợ lý AI (ChatGPT, Claude, Cursor qua MCP): AI **không được phép tự ý thay đổi trực tiếp** chiến dịch thật. Mọi hành động ghi sẽ tạo một bản ghi chờ duyệt (Pending Approval) để người dùng xác nhận trên giao diện app trước khi thi hành.

### 3.4. Hệ thống Tự động cập nhật (Auto-Updater via Tauri & GitHub Releases)
- Ứng dụng tích hợp `tauri-plugin-updater` sử dụng thuật toán ký số **Minisign**.
- File installer (`.exe`) sau khi biên dịch được ký số bằng private key để tạo ra file chữ ký `.sig`.
- Khi release phiên bản mới lên GitHub, app client kiểm tra file `latest.json` tại release mới nhất. Nếu có phiên bản cao hơn, client tải về ngầm, kiểm tra chữ ký khớp với public key đã nhúng, cài đặt im lặng và khởi động lại ứng dụng.

---

## 4. Hướng dẫn Lệnh phát triển (Developer Commands)

| Lệnh | Ý nghĩa |
|---|---|
| `npm run dev` | Khởi chạy giao diện web Next.js ở môi trường phát triển (cổng 3000) |
| `npm run build` | Biên dịch toàn bộ web app sang dạng độc lập (`.next/standalone`) |
| `npm run desktop:dev` | Chạy thử ứng dụng desktop qua Edge/Chrome app mode (không cần cài Rust) |
| `npm run desktop:prepare` | Stage mã nguồn standalone + WASM + runtime Node vào thư mục của Tauri |
| `npm run desktop:build` | Biên dịch toàn bộ ứng dụng ra file cài đặt NSIS (`.exe`) và tạo file ký số |
| `npm run db:generate` | Sinh file SQL migration mới khi thay đổi `src/db/schema.ts` |
| `npm run db:migrate` | Áp dụng các migration mới vào cơ sở dữ liệu cục bộ |
