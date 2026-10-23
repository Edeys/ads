# AdsSync

Ứng dụng **quản trị & tự động hoá quảng cáo đa kênh, self-hosted**: kéo chỉ số thật từ
Meta / TikTok / Google / OpenAI Ads, đặt luật Ads Autopilot, soạn quảng cáo nhanh, và mở
**MCP server nội bộ** để AI (Claude, Cursor, …) làm việc trên dữ liệu của bạn.

Chạy được hai kiểu:

- **Web self-host**: Next.js 15 + PGlite (không cần cài Postgres).
- **Desktop**: Tauri 2, dữ liệu trong `%APPDATA%\AdsSync`, không cần cài Node.

> Mọi lệnh **ghi** lên tài khoản quảng cáo thật đều đi qua **Approval Gate** (owner duyệt
> trong app) và mặc định bị chặn ở chế độ mock. Đây là điểm khác biệt cốt lõi so với các
> công cụ "cho AI toàn quyền".

---

## Tính năng

| Nhóm | Nội dung |
| --- | --- |
| **Chỉ số** | 32 chỉ số hợp nhất (13 Meta · 8 TikTok · 6 Google · 5 OpenAI Ads), đổi cột hiển thị, gộp nhiều TKQC, so sánh kỳ trước |
| **Ads Autopilot** | Luật tự tắt theo ngưỡng CPA, kéo chỉ số theo lịch, tăng/giảm ngân sách, tự chạy lại khi lỗi |
| **Quick Ads** | Quét bài viết của Page → chọn mẫu → phát hành (mock mặc định) |
| **MCP server** | Endpoint `POST /mcp?key=…`, JSON-RPC, scope theo key, Bộ chỉ số để cắt payload, Skill Hub |
| **Tool SDK** | Khai báo **custom tool HTTP** bằng manifest, AI gọi được qua MCP, tool có side effect phải duyệt |
| **Cộng tác** | Biz nhiều thành viên, 18 quyền chi tiết, lời mời, nhật ký thao tác 30 ngày |
| **Vận hành** | Thông báo, hỗ trợ, gói cước/hạn mức, webhook ra n8n, publisher bài viết, bình luận Facebook |

---

## Kiến trúc

```
Next.js 15 (App Router, RSC + Route Handlers)
├── UI: Tailwind + Radix primitives
├── DB: PGlite (embedded Postgres WASM) qua Drizzle ORM   → ./.pgdata hoặc %APPDATA%\AdsSync
├── Worker: scheduler chạy TRONG process server (tick 30s · health 15m · social 60s)
├── MCP: /mcp (JSON-RPC, stateless) + Approval Gate
└── Desktop: Tauri 2 shell → spawn Node sidecar chạy Next standalone
```

> 📖 **Xem chi tiết sơ đồ luồng, phân rã thư mục và thiết kế tại [ARCHITECTURE.md](ARCHITECTURE.md).**

Vì PGlite chỉ cho **một process** mở thư mục dữ liệu, scheduler không chạy thành process
riêng. Muốn tách worker: đặt `DATABASE_URL` trỏ tới Postgres thật rồi chạy `npm run worker`.

---

## Chạy nhanh (web)

Yêu cầu: Node.js ≥ 20.

```bash
npm install
cp .env.example .env        # điền NEXTAUTH_SECRET (bất kỳ chuỗi dài ≥ 32 ký tự)
npm run db:push             # generate + apply migration vào ./.pgdata
npm run seed                # user dev@local.test + biz my-biz + 3 mẫu quảng cáo
npm run dev                 # http://localhost:3000
```

Đăng nhập dev: `dev@local.test` → vào `/biz/my-biz/dashboard`.

### Kết nối tài khoản quảng cáo

Điền các biến trong `.env` (`META_APP_ID`, `TIKTOK_APP_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN`, …)
rồi vào **Kết nối** trong app để OAuth. Không có credential thật thì app vẫn chạy ở chế độ
mock (số liệu sinh tự động, mọi write bị chặn).

---

## Chạy desktop

```bash
npm run desktop:dev        # build standalone + mở cửa sổ app (không cần Rust)
```

Bản cài đặt `.exe` cần Rust: xem [`desktop/README.md`](desktop/README.md).

---

## MCP server nội bộ

1. Vào **API key MCP** → tạo key (chọn scope từng nền tảng + quyền ghi).
2. Trỏ client MCP vào:

```json
{
  "mcpServers": {
    "adsync": {
      "url": "http://localhost:3000/mcp?key=mcp_xxx"
    }
  }
}
```

Tool đọc chạy ngay; tool ghi (tắt/bật, đổi ngân sách, đăng bài, reply comment, custom tool
có side effect) trả `pending_approval` và chờ owner duyệt tại **Nhật ký phê duyệt**.

### Tool SDK (custom tool)

Khai báo tại **Custom tools** (hoặc `POST /api/biz/:slug/custom-tools`):

```json
{
  "name": "crm_lookup_order",
  "description": "Tra cứu đơn hàng theo mã",
  "method": "GET",
  "url": "https://crm.example.com/api/orders/{{order_id}}",
  "headers": { "x-api-key": "{{api_key}}" },
  "inputSchema": {
    "type": "object",
    "properties": { "order_id": { "type": "string" }, "api_key": { "type": "string" } },
    "required": ["order_id", "api_key"]
  },
  "requiresApproval": false
}
```

Chỉ hỗ trợ HTTP — app không chạy code tuỳ ý từ manifest.

---

## An toàn

| Cơ chế | Cách hoạt động |
| --- | --- |
| Mock mặc định | `ADSYNC_MOCK=1` (desktop luôn bật) — không có request ghi nào ra ngoài |
| Ghi thật | cần `ADSYNC_REAL_WRITES=1` **và** approval đã duyệt |
| Scope key | mỗi MCP key giới hạn theo nền tảng, quyền ghi, danh sách tool, skill được gắn |
| Audit | mọi lần chạy tool/approval ghi vào `activity_logs` (30 ngày) |
| Bind local | server chỉ nghe `127.0.0.1`, desktop chọn cổng ngẫu nhiên |

Chi tiết + cách báo lỗi: [`SECURITY.md`](SECURITY.md).

---

## Cấu trúc repo

```
src/app/            # route + UI (App Router)
src/app/api/        # REST API (biz-scoped, guard theo permission)
src/app/mcp/        # MCP endpoint JSON-RPC
src/mcp/            # registry tool + Approval Gate dispatcher
src/lib/            # tích hợp Meta/TikTok/Google/Pancake, ad-metrics, custom-tools…
src/db/             # schema Drizzle + seed
src/worker/         # engine autopilot (chạy trong process hoặc process riêng)
desktop/            # Tauri 2 shell + script đóng gói
scripts/            # verify_* (API/edge cases), capture/ (đo UI parity)
drizzle/            # migration SQL
```

---

## Kiểm thử

```bash
node scripts/verify_custom_tools.mjs   # Tool SDK + MCP + approval (19 case)
node scripts/verify_configs.mjs        # Configs/autopilot
node scripts/verify_shell_apis.mjs     # billing/members/notifications…
node scripts/verify_quick_ads.mjs      # Quick Ads
node scripts/verify_ad_metrics.ts      # Ad metrics contract
```

Các script cần server đang chạy ở `http://localhost:3000` (đổi bằng `LOCAL_BASE`).

---

## Ghi chú về Done.vn

Repo này là **bản tự phát triển lại** (clean-room reimplementation) lấy cảm hứng từ luồng
nghiệp vụ của một sản phẩm SaaS quảng cáo. Không chứa JS/CSS/asset/logo/nội dung copy từ
sản phẩm đó; tên thương hiệu, câu chữ và dữ liệu trong app là của riêng dự án này.

---

## Giấy phép

[MIT](LICENSE).
