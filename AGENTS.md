# AGENTS.md — Hướng Dẫn Dành Cho AI Agents & Developers

Chào mừng các AI Agents (Cursor, Claude Code, Windsurf, Antigravity, Cline, Roo Code...) và Developers khi làm việc trong repository này!

Repository này tích hợp và vận hành **2 MẢNG CÔNG VIỆC TÁCH BIỆT (DUAL MISSION)**. Bất kỳ Agent nào khi vào repo cần xác định rõ nhiệm vụ của mình thuộc Mảng nào để thao tác đúng bối cảnh, tránh nhầm lẫn giữa môi trường local và cloud.

---

## 🎯 HAI MẢNG CÔNG VIỆC TRONG REPOSITORY

```
┌────────────────────────────────────────────────────────────────────────┐
│                        D:\ADS MCP APP (Workspace)                      │
├───────────────────────────────────┬────────────────────────────────────┤
│  MẢNG 1: AdsSync Local Platform    │  MẢNG 2: Cloud Done.vn Live MCP    │
│  (Ứng dụng Self-Hosted độc lập)    │  (Kết nối tài khoản bản quyền thật)│
├───────────────────────────────────┼────────────────────────────────────┤
│ • Web app Next.js 15 App Router   │ • Endpoint: https://mcp.done.vn/mcp│
│ • Database PGlite (.pgdata)       │ • Token: mcp_*** (xem .env.local)  │
│ • Chạy local tại port 3000        │ • 18 Tools quảng cáo đa kênh       │
│ • Autopilot CPA, Live Metrics     │ • Cung cấp data thật cho AI Agents │
│ • Approval Gate bảo vệ tài khoản  │ • Đọc số liệu Meta, TikTok, Google │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## 📌 MẢNG 1: AdsSync Local Platform (Clone & Self-Hosted App)

### 1. Mục đích
Xây dựng nền tảng quản trị và tự động hóa quảng cáo đa kênh khép kín, tự lưu trữ dữ liệu tại máy người dùng (`.pgdata`), không phụ thuộc cloud bên thứ ba, bổ sung cơ chế kiểm duyệt lệnh AI (Approval Gate) và lưu trữ Audit Log 30 ngày.

### 2. Tech Stack & Kiến trúc
* **Frontend & Backend**: Next.js 15 (App Router, React Server Components, Server Actions, Route Handlers).
* **Database**: PGlite embedded PostgreSQL (lưu tại `D:\ADS MCP APP\.pgdata`), quản lý bởi Drizzle ORM (`src/db/schema.ts`).
* **UI**: Tailwind CSS + Radix UI primitives.
* **Auth**: NextAuth v5 (chế độ Self-Hosted Dev Login một chạm `dev@local.test` + sẵn sàng Google OAuth).
* **Local MCP Server**: Endpoint `http://localhost:3000/mcp?key=...` hỗ trợ cơ chế phê duyệt lệnh ghi (write tools) trước khi can thiệp tài khoản thật.

### 3. Cấu trúc thư mục chính
* `src/app/biz/[slug]/dashboard/`: Các màn hình chính (Tổng quan, Chỉ số Live Viewer, Kết nối, Cấu hình Autopilot, Lịch ngân sách, CPA, Quick Ads, Báo cáo, Nhật ký, Cài đặt).
* `src/app/api/`: Các REST API endpoints xử lý OAuth, kết nối, chỉ số, phê duyệt.
* `src/mcp/`: Server MCP nội bộ của AdsSync (`server.ts`, `tools/meta.ts`, `tools/tiktok.ts`, `tools/pancake.ts`).
* `src/lib/`: Các thư viện tích hợp Marketing API (Meta, TikTok, Google Ads, Pancake, Sheets, Telegram, Zalo OA).
* `src/worker/`: Engine chạy ngầm kiểm tra định kỳ các jobs Autopilot.

### 4. Quy tắc phát triển (Dành cho Agents khi sửa code)
* **Kiểm tra TypeScript**: Luôn chạy `npx tsc --noEmit` hoặc `npm run build` sau khi chỉnh sửa code.
* **Server Daemon**: Server local chạy nền qua Windows Task Scheduler task `AdsSyncServer` (PID quản lý tự động, lắng nghe tại `http://localhost:3000`). Nếu cần khởi động lại, dùng lệnh PowerShell:
  ```powershell
  Stop-ScheduledTask -TaskName "AdsSyncServer"; Start-Sleep -Seconds 1; Start-ScheduledTask -TaskName "AdsSyncServer"
  ```
* **Database Single-Process**: PGlite chỉ cho phép 1 tiến trình truy cập `.pgdata` cùng lúc. Tránh chạy đồng thời 2 tiến trình Next.js cùng ghi vào `.pgdata`.

---

## 🚀 MẢNG 2: Cloud Done.vn Live MCP Integration (Tài khoản bản quyền)

### 1. Mục đích
Tận dụng tài khoản bản quyền 3 tháng của chủ tài khoản trên **Done.vn** để AI Agents kết nối trực tiếp vào hệ thống của họ qua giao thức Model Context Protocol (MCP), kéo số liệu chiến dịch quảng cáo thật về phân tích, viết báo cáo hoặc tối ưu.

### 2. Thông số kết nối Live MCP
* **URL**: `https://mcp.done.vn/mcp`
* **Transport**: Streamable HTTP (Header bắt buộc: `Accept: application/json` và `mcp-session-id`)
* **API Key**: đặt trong `.env.local` (`DONE_VN_MCP_TOKEN`) — file này đã gitignore.
  Các file `.mcp.json` / `mcp.json` / `.cursor/mcp.json` chỉ chứa placeholder `${DONE_VN_MCP_TOKEN}`,
  khi dùng thật thì thay bằng token của bạn (không commit token).
* **Server Info**: `AdSync v1.27.0` (smztech.io.vn)

### 3. File cấu hình đã sẵn sàng cho các Agents
Các file này đã được đặt ở vị trí tiêu chuẩn để mọi tool/IDE tự nhận diện:
* [`.mcp.json`](file:///D:/ADS%20MCP%20APP/.mcp.json) — Chuẩn cho Claude Code, Cursor, Windsurf, T3 Code.
* [`.cursor/mcp.json`](file:///D:/ADS%20MCP%20APP/.cursor/mcp.json) — Chuẩn cho Cursor IDE.
* [`mcp.json`](file:///D:/ADS%20MCP%20APP/mcp.json) — Chuẩn fallback.
* [`scripts/adsync-mcp-bridge.mjs`](file:///D:/ADS%20MCP%20APP/scripts/adsync-mcp-bridge.mjs) — Script cầu nối Stdio-to-HTTP dành cho các client chỉ hỗ trợ command stdio.

### 4. Danh sách 18 Live Tools khả dụng từ Done.vn
| Nền tảng | Tools |
|---|---|
| **Meta Ads** | `meta_get_ad_accounts`, `meta_get_insights`, `meta_get_campaign_details`, `meta_get_post_details`, `meta_get_pages`, `meta_get_page_posts`, `meta_get_pixels` |
| **TikTok Ads** | `tiktok_get_ad_accounts`, `tiktok_get_campaign_details`, `tiktok_get_insights`, `tiktok_get_gmv_max_stores`, `tiktok_get_gmv_max_insights` |
| **Google Ads** | `google_ads_get_accounts`, `google_ads_get_campaigns`, `google_ads_get_insights` |
| **OpenAI Ads** | `openai_ads_get_accounts`, `openai_ads_get_insights`, `openai_ads_get_conversion_insights` |

### 5. QUY TẮC BẮT BUỘC KHI AGENT GỌI TOOL DONE.VN:
1. **Luôn gọi tool lấy tài khoản trước**:
   * Với Meta Ads $\rightarrow$ gọi `meta_get_ad_accounts()` để lấy `credential_id` & `ad_account_id`.
   * Với TikTok Ads $\rightarrow$ gọi `tiktok_get_ad_accounts()` để lấy `credential_id` & `advertiser_id`.
   * Với Google Ads $\rightarrow$ gọi `google_ads_get_accounts()` để lấy `credential_id`.
2. **Hỏi người dùng khi có nhiều tài khoản**: Nếu tài khoản trả về nhiều hơn 1 TKQC, **Agent phải in danh sách và hỏi người dùng muốn xem tài khoản nào**, KHÔNG tự tiện lấy hết toàn bộ data.
3. **Tránh nhầm lẫn thao tác**: Khi người dùng yêu cầu câu lệnh chung chung (ví dụ: *"xem hiệu quả hôm nay"*), Agent phải hỏi rõ người dùng muốn kiểm tra nền tảng nào (Meta, TikTok hay Google).

---

## 📋 CHECKLIST CHO AGENT MỚI KHI BẮT ĐẦU TASK

- [ ] Xác định rõ yêu cầu của người dùng thuộc **Mảng 1** (phát triển app local) hay **Mảng 2** (truy vấn số liệu qua MCP Done.vn).
- [ ] Nếu là Mảng 1: Kiểm tra trạng thái server local qua `Get-NetTCPConnection -LocalPort 3000` hoặc endpoint `http://localhost:3000`.
- [ ] Nếu là Mảng 2: Sử dụng các tools được khai báo trong `.mcp.json` hoặc chạy script test qua `scripts/adsync-mcp-bridge.mjs`.
- [ ] Luôn đối chiếu với tài liệu gốc [`DONE_VN_SPEC.md`](file:///D:/ADS%20MCP%20APP/DONE_VN_SPEC.md) để đảm bảo tuân thủ đặc tả giao diện và luồng nghiệp vụ.
