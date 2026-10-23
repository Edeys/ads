# AdsSync Desktop (Tauri 2)

Vỏ desktop cho AdsSync: Next.js **standalone** chạy như sidecar do Tauri quản lý, dữ liệu
PGlite nằm trong `%APPDATA%\AdsSync`, không cần cài Node hay Postgres trên máy người dùng
(runtime Node được đóng gói kèm).

---

## 1. Yêu cầu

| Thành phần | Phiên bản | Ghi chú |
| --- | --- | --- |
| Node.js | ≥ 20 | chỉ cần trên máy build |
| Rust | ≥ 1.77.2 (stable) | cài qua [rustup.rs](https://rustup.rs) — **bắt buộc để build .exe/.msi** |
| Microsoft C++ Build Tools | VS 2022, workload "Desktop development with C++" | bắt buộc cho Rust trên Windows |
| WebView2 | có sẵn trên Windows 10/11 | Tauri dùng WebView2 |

> Nếu máy chưa có Rust: dùng chế độ **chạy không cần Rust** ở mục 3.

---

## 2. Build bản cài đặt

```powershell
# 1) build Next standalone + stage resource + copy node.exe
npm run build
npm run desktop:prepare

# 2) build app Tauri (lần đầu tải crate, có thể mất 5–15 phút)
npm --prefix desktop install
npm run desktop:build
```

Kết quả:

- `desktop/src-tauri/target/release/bundle/nsis/AdsSync_0.1.0_x64-setup.exe`
- `desktop/src-tauri/target/release/adsync-desktop.exe` (bản portable, cần thư mục resource đi kèm)

Chỉ build lại phần giao diện (không đổi Rust):

```powershell
npm run build
npm run desktop:prepare
npm --prefix desktop run build
```

---

## 3. Chạy thử không cần Rust (Edge/Chrome app mode)

```powershell
npm run desktop:dev                 # build lần đầu + mở cửa sổ app
npm run desktop:dev -Rebuild        # ép build lại
powershell -ExecutionPolicy Bypass -File desktop/dev.ps1 -Port 3210
```

Script sẽ: áp migration → chạy `server.js` ẩn → chờ `/api/health` → `POST /api/dev/bootstrap`
(seed lõi, idempotent) → mở cửa sổ Edge/Chrome `--app=` trỏ vào server. Đóng cửa sổ là server tắt.

---

## 4. Dữ liệu, log, secret

| Thứ | Đường dẫn |
| --- | --- |
| Database PGlite | `%APPDATA%\AdsSync\` (`pgdata` bên trong) |
| Log server + migration | `%APPDATA%\AdsSync\server.log` |
| Secret NextAuth (tự sinh lần đầu) | `%APPDATA%\AdsSync\secret.txt` |
| Cấu hình OAuth ứng dụng | `%APPDATA%\AdsSync\oauth.env` |
| Profile trình duyệt (chế độ dev.ps1) | `%APPDATA%\AdsSync\browser-profile` |

Xoá sạch dữ liệu: đóng app rồi xoá `%APPDATA%\AdsSync`. Lần mở sau sẽ tạo lại + seed lõi.

Đăng nhập: **Google OAuth** (không còn dev login).

---

## 5. An toàn

- Shell luôn đặt `ADSYNC_MOCK=1`: mọi lệnh ghi lên tài khoản quảng cáo thật bị chặn ở mock +
  audit log. Muốn bật ghi thật phải chủ động chạy server bằng tay với `ADSYNC_REAL_WRITES=1`
  và đi qua Approval Gate.
- Server chỉ bind `127.0.0.1` (cổng ưu tiên 3210).
- Không có telemetry, không gọi cloud ngoài các API quảng cáo bạn tự kết nối.
- **Secret NextAuth phải ổn định giữa các lần mở app** — nếu đổi, mọi phiên đăng nhập cũ mất hiệu lực.

---

## 6. Vì sao PGlite chạy trong cùng process với worker?

PGlite (Postgres WASM) chỉ cho **một process** mở một thư mục dữ liệu. Vì vậy:

- Migration chạy bằng `bootstrap.mjs` (node thuần) **trước khi** spawn server rồi đóng kết nối.
- Scheduler (tick 30s, health 15m, social 60s) chạy **trong** process server
  (`ADSYNC_INPROC_WORKER=1`, khởi động từ route `/api/health`).
- Không chạy `npm run worker` song song với app desktop.

Nếu muốn tách worker ra process riêng, đặt `DATABASE_URL` trỏ tới Postgres thật.

---

## 7. Cấu trúc thư mục

```
desktop/
  prepare.mjs            # stage .next/standalone + drizzle + pglite + drizzle-orm + node.exe
  bootstrap.mjs          # áp migration trước khi chạy server
  make-icons.mjs         # sinh icon PNG/ICO (không cần thư viện ngoài)
  dev.ps1                # chạy desktop không cần Rust
  ui/index.html          # splash screen (frontendDist)
  src-tauri/
    src/main.rs          # chọn cổng → migrate → spawn node → health → navigate
    tauri.conf.json      # bundle NSIS, resource app/, externalBin node
    capabilities/        # quyền tối thiểu + remote.urls cho IPC từ origin local
    icons/               # icon sinh tự động
    resources/app/       # (generated) server standalone + drizzle + bootstrap.mjs
    binaries/            # (generated) node-x86_64-pc-windows-msvc.exe
```

`resources/app` và `binaries` là **output build**, không commit (xem `.gitignore`).

---

## 8. Biến môi trường shell đọc

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `ADSYNC_APP_DIR` | resource dir | trỏ thẳng tới thư mục có `server.js` (tiện debug) |
| `ADSYNC_NODE_BIN` | `binaries/node.exe` | dùng node khác (vd. node hệ thống) |
| `ADSYNC_DEV_URL` | – | bỏ qua spawn, mở thẳng URL (dùng với `npm run dev`) |
| `ADSYNC_PORT` | 3210 | cổng server (cố định để OAuth redirect URI ổn định) |

Ví dụ phát triển shell với Next dev:

```powershell
npm run dev                                   # cửa sổ 1
$env:ADSYNC_DEV_URL="http://localhost:3000"; npm --prefix desktop run dev
```

---

## 9. Cài đặt và chạy bản đóng gói

```powershell
# build trọn bộ (Next standalone → stage → NSIS installer)
npm run build
npm run desktop:build

# cài thử không cần tương tác
desktop\src-tauri\target\release\bundle\nsis\AdsSync_0.1.0_x64-setup.exe /S

# chạy
& "$env:LOCALAPPDATA\AdsSync\adsync-desktop.exe"
```

Sau khi mở, log nằm ở `%APPDATA%\AdsSync\server.log`, trong đó có dòng
`[desktop] launch: app_dir=... node=... port=...` để tra khi server không lên.

---

## 10. Những lỗi Windows đã gặp và cách xử lý

Các lỗi làm build/khởi động thất bại trên Windows — đã sửa trong mã, ghi lại để khỏi vấp lại:

1. **`RC : fatal error RW1022: I/O error writing file`** khi `cargo build`.
   `RC.EXE` của Windows SDK **không đọc được ICO nén PNG**. `make-icons.mjs` giờ sinh
   ICO dạng DIB 32bpp (BMP) và ghi header/directory bằng **little-endian** (trước đó dùng
   `writeUInt32BE` cho trường size → sai endian → RC không parse được).
   Chạy lại `npm run desktop:icons` sau khi sửa script.

2. **`Error: EISDIR ... lstat 'D:'` khi node khởi động.**
   `tauri::path::resource_dir()` trả về đường dẫn dạng `\\?\D:\...` (extended-length path);
   node/libuv không parse được argv dạng này nên rơi về `'D:'`.
   Sửa: `strip_verbatim()` trong `main.rs` bỏ prefix `\\?\`, **và** truyền script
   **tương đối** (`bootstrap.mjs`, `server.js`) kèm `current_dir = app_dir` để không còn
   phụ thuộc vào dấu nháy/khoảng trắng của đường dẫn.

3. **`ERR_MODULE_NOT_FOUND: Cannot find package 'drizzle-orm'`** khi chạy `bootstrap.mjs`.
   Next standalone không để lại `drizzle-orm` (đã bị bundle), nhưng `bootstrap.mjs` chạy
   node thuần nên cần package thật → `prepare.mjs` copy thêm `node_modules/drizzle-orm`.

4. **Gói cài phục vụ HTML cũ** (trang `/login` còn nút "Dev login" dù đã bỏ provider dev).
   Gói Next mang theo `.next/server/route-cache` → `prepare.mjs` xoá cache đó, và shell tự
   dọn `.next/server/route-cache` + `.next/cache` mỗi lần khởi động.

5. **`tauri build` bị kẹt file** → process `tauri build` cũ chưa kết thúc giữ file. Kill process
   cũ trước khi build lại.

6. **`link.exe` lỗi `BCryptGenRandom`** → thiếu thư viện. Đã thêm
   `println!("cargo:rustc-link-lib=bcrypt")` trong `src-tauri/build.rs`.

Ngoài ra: file `.env` trong gói là bản dev (không có secret thật); `.env.local` không
được đóng gói. `NEXTAUTH_SECRET`/`NEXTAUTH_URL` do shell tự sinh và ghi đè lúc chạy.

---

## 11. Cổng cố định & kết nối OAuth

| Mục | Giá trị |
| --- | --- |
| Cổng mặc định | `3210` (đổi bằng biến môi trường `ADSYNC_PORT`) |
| Origin của app | `http://127.0.0.1:3210` |
| File cấu hình OAuth | `%APPDATA%\AdsSync\oauth.env` |

Vì sao cố định cổng: Meta/TikTok/Google yêu cầu `redirect_uri` khớp **chính xác** URI đã đăng ký.
Nếu cổng đổi mỗi lần mở app thì phải đăng ký lại. Nếu cổng 3210 đang bị chiếm, app lùi về cổng
ngẫu nhiên (khi đó OAuth không dùng được, nhưng luồng nhập token thủ công vẫn chạy bình thường).

Cách khai ứng dụng (không cần sửa file thủ công): mở app → **Cài đặt → Ứng dụng OAuth**, dán App
ID/Secret rồi bấm *Lưu cấu hình* (áp dụng ngay, không cần khởi động lại). Trang này cũng hiện sẵn
Redirect URI cần đăng ký ở từng nền tảng:

```
Meta   → http://localhost:3210/api/connect/meta/callback
TikTok → http://localhost:3210/api/connect/tiktok/callback
Google → http://127.0.0.1:3210/api/connect/google/callback
```

> Facebook chặn `http://127.0.0.1` vì coi là kết nối không bảo mật, nên Meta dùng `localhost`.
> Nếu vẫn báo *“không sử dụng kết nối bảo mật”*, vào **Facebook Login → Settings** tắt
> **Enforce HTTPS** khi app còn Development mode, hoặc dùng tunnel HTTPS.

Có thể sửa `%APPDATA%\AdsSync\oauth.env` bằng tay (file được tạo mẫu ở lần chạy đầu):

```
META_APP_ID=
META_APP_SECRET=
TIKTOK_APP_ID=
TIKTOK_APP_SECRET=
TIKTOK_REDIRECT_URL=http://localhost:3210/api/connect/tiktok/callback
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### Trạng thái đã đăng ký (cập nhật 2026-10-22)

| Nền tảng | Đã có | Còn thiếu |
| --- | --- | --- |
| Meta | App `AdsSync` — App ID `982401747625085`; đã khai 2 redirect URI; đã thêm product "Facebook Login for Business" (Quickstart Web, Site URL `https://xuanloi.me`); quyền `ads_read`/`ads_management`/`business_management`/`pages_show_list`/`pages_read_engagement`/`pages_manage_ads` (sẵn sàng thử nghiệm) | `pages_manage_posts`/`pages_manage_engagement`/`publish_video`/`pages_messaging` chưa xin được (thêm ở tab *Quyền và tính năng* của use case); muốn dùng cho TKQC không thuộc quyền thì cần app Live + App Review |
| Google | Project `adssync-512315` (số `32151334702`); đã bật Google Ads API; consent screen (External + test user `xuanloi.me@gmail.com`); **OAuth client Web đã tạo** (`client_id` + `client_secret` đã lưu trong `oauth.env`, file gốc `C:\App\client_secret_32151334702-*.json`) | **Developer Token** cho Google Ads API (xin ở `ads.google.com/manager/api`, Google duyệt tay vài ngày) |
| TikTok | **Đã tạo app `AdsSync`** trên TikTok for Business (developer registration đã duyệt hồ sơ, app đang `Pending` — TikTok duyệt tối đa 3 ngày); redirect URL đăng ký = `http://localhost:3210/api/connect/tiktok/callback`; scope xin: Ad account management, Ads management, Reporting, Measurement | **App ID + App Secret chỉ hiện sau khi app được duyệt** (hiện cột App ID/Secret = `--`). Khi có: điền `TIKTOK_APP_ID`/`TIKTOK_APP_SECRET` vào Cài đặt → Ứng dụng OAuth rồi khởi động lại app |

### Còn 1 việc tự làm được trên Google Cloud Console (bị Google chặn ghi)

Từ 2026-10-22, mọi thao tác **ghi** trên Google Cloud Console của tài khoản này đều báo
*"Save failed — The attempted action failed, please try again"* (có tracking number), kèm cảnh báo
*"Google has temporarily blocked your account or network"*. **Cách khắc phục: đổi node VPN rồi thử lại**,
hoặc đợi Google mở lại. Khi console ghi được, làm 2 việc sau:

1. **Client OAuth → Web client 1 → Authorized redirect URIs** — thêm 4 URI (bắt buộc cho đăng nhập Google):

   ```
   http://localhost:3210/api/auth/callback/google      <- app desktop (server luôn tự tính base URL là "localhost")
   http://127.0.0.1:3210/api/auth/callback/google
   http://localhost:3000/api/auth/callback/google      <- bản web (npm run dev)
   http://127.0.0.1:3000/api/auth/callback/google
   ```

2. **OAuth consent screen → Data Access** — thêm scope `https://www.googleapis.com/auth/adwords`
   (dùng cho nhánh Google Ads). Các scope `openid/email/profile` đã có sẵn.

---

## 12. Luồng đăng nhập Google của bản desktop (đã kiểm chứng chạy thật 2026-10-22)

1. Webview bấm **Đăng nhập với Google** → `POST /api/desktop/auth-bridge` sinh mã + URL.
2. Shell gọi lệnh Rust `open_external` để mở trình duyệt hệ thống tại
   `/api/desktop/auth-bridge/launch?code=...` — trang này tự lấy `csrfToken` rồi POST
   `/api/auth/signin/google` (NextAuth v5 **không** nhận GET cho route này).
   Có thể thêm `&email=...` vào URL launch → NextAuth forward thành `login_hint` của Google
   (bỏ màn chọn tài khoản khi máy đang đăng nhập nhiều tài khoản).
3. Google đăng nhập → callback `/api/auth/callback/google` → NextAuth chuyển tới
   `/api/auth/bridge?code=...`: route này lưu cookie phiên (mã hoá) vào bảng
   `desktop_auth_bridges`.
4. Webview poll `GET /api/desktop/auth-bridge/status?code=...` → nhận `Set-Cookie` phiên
   (cùng origin) → **chuyển thẳng `window.location.href = callbackUrl`** (mặc định `/biz`).

> Lưu ý: trang `/login` **không reload lại chính nó** sau khi đăng nhập — nếu reload thì vẫn hiện
> form đăng nhập dù cookie đã có. Vì vậy:
> - client component dùng `location.href = callbackUrl` sau khi poll thành công;
> - `/login` (server component) tự `redirect(callbackUrl)` nếu đã có session → mở lại app cũng vào
>   thẳng workspace, không phải đăng nhập lại.
>
> Ngoài ra, lệnh IPC `open_external` phải được khai trong ACL (webview tải từ origin **remote**
> nên app command bị chặn nếu thiếu permission):
> `build.rs` → `tauri_build::AppManifest::new().commands(&["open_external"])` và
> `capabilities/default.json` → `"permissions": ["core:default", "allow-open-external"]`.

**Hai origin khác nhau — rất quan trọng:**

| Biến | Giá trị | Dùng cho |
| --- | --- | --- |
| `APP_URL` | `http://127.0.0.1:3210` | OAuth nền tảng quảng cáo (Meta/Google Ads/TikTok) — đúng URI đã đăng ký |
| `NEXTAUTH_URL` / `AUTH_URL` | `http://localhost:3210` | luồng **đăng nhập** |

Lý do: server Next **tự chuẩn hoá `127.0.0.1` thành `localhost`** khi dựng URL callback của
NextAuth. Nếu luồng đăng nhập chạy trên `127.0.0.1` thì cookie PKCE/CSRF (set khi POST
signin) không được gửi lại ở callback (`localhost`) → lỗi *"pkceCodeVerifier value could not be
parsed"*. Vì vậy toàn bộ luồng đăng nhập (launch → csrf → signin → callback → bridge) phải
dùng `localhost`, còn phần webview vẫn ở `127.0.0.1` và nhận cookie phiên qua
`Set-Cookie` của route status (cùng origin với webview).

Ngoài ra: callback `signIn` của NextAuth **luôn provision user theo email** — với OAuth,
`user.id` là id của Google (không có trong DB), nếu bỏ qua `provisionUser` thì sẽ lỗi
foreign key khi lưu bridge.

> **Không thêm `prompt=consent`** vào URL launch (chỉ thêm khi thật sự cần). Nếu thêm, Google hiện màn
> consent → JS của `accounts.google.com` phải hydrate → nếu `gstatic` bị chặn (VPN) thì nút
> "Tiếp tục" không ăn → treo. Không có `prompt=consent` thì Google tự redirect (nếu đã cấp consent
> trước) → không cần JS.

---

## 13. Rà soát tính năng & so sánh với app.done.vn (2026-10-22)

### 13.1. Route: AdsSync có ĐẦY ĐỦ, không thiếu gì so với done.vn

| Route | done.vn | AdsSync desktop | Ghi chú |
|---|---|---|---|
| /dashboard (Tổng quan) | ✅ | ✅ | 15 nút, có tên user |
| /dashboard/ad-metrics (Chỉ số quảng cáo) | ✅ | ✅ | 30 nút |
| /dashboard/ad-metrics/settings (Cấu hình) | ✅ | ✅ | |
| /dashboard/configs (Tự động hoá) | ✅ | ✅ | có filter metrics/auto-pause/auto-run |
| /dashboard/cpa (Ngưỡng CPA) | ✅ | ✅ | |
| /dashboard/quick-ads (Quảng cáo nhanh) | ✅ | ✅ | |
| /dashboard/quick-ads/templates (Mẫu quảng cáo) | ✅ | ✅ | |
| /dashboard/connections (Kết nối) | ✅ | ✅ | 47 nút — nhiều nhất |
| /dashboard/reports (Phân tích) | ✅ | ✅ | 145 KB — nặng nhất (báo cáo) |
| /dashboard/activity (Nhật ký) | ✅ | ✅ | |
| /dashboard/mcp-keys (MCP Server) | ✅ | ✅ | 19 nút |
| /dashboard/mcp-keys/field-presets (Bộ chỉ số) | ✅ | ✅ | |
| /dashboard/mcp-keys/skills (Skill Hub) | ✅ | ✅ | |
| /dashboard/support (Hỗ trợ) | ✅ | ✅ | |
| /dashboard/huong-dan (Hướng dẫn) | ✅ | ✅ | |
| /dashboard/budget-schedule (Tăng giảm ngân sách) | ✅ | ✅ | |

**15/15 route của done.vn đều có trong AdsSync.** 35/35 route AdsSync trả 200 với nội dung thật
(đã kiểm tra tự động bằng cookie phiên thật).

### 13.2. AdsSync CÓ THÊM (done.vn không có trong sidebar)

| Route | Tính năng |
|---|---|
| /dashboard/billing | Gói cước & thanh toán (mục Cài đặt) |
| /dashboard/comments | Bình luận Facebook (trả lời / ẩn / rule tự động) |
| /dashboard/publisher | Đăng bài tự động (composer + lịch đăng) |
| /dashboard/n8n | n8n & Webhooks (event outbound) |
| /dashboard/post-triggers/create | Tự động chạy ads khi có biến cố |
| /dashboard/tools | Custom tools |
| /settings/biz | Cài đặt Biz & đổi người |
| /settings/invites | Lời mời |
| /settings/invoices | Hoá đơn |
| /settings/members | Thành viên |
| /settings/oauth | Ứng dụng OAuth (Meta/TikTok/Google) |
| /settings/roles | Vai trò & quyền (18 quyền / 5 nhóm) |

Command menu (Cmd+K) của AdsSync có 19 mục, gần như trùng khớp done.vn + thêm 6 mục AdsSync.

### 13.3. THIẾU so với done.vn (cần xử lý)

| # | Thiếu gì | Mức độ | Ghi chú |
|---|---|---|---|
| 1 | **Xác minh số điện thoại (OTP qua Zalo)** | ⚠️ Cao | done.vn bắt buộc 3 bước: (1) đăng nhập Google (2) xác minh SĐT + captcha + OTP Zalo (3) chấp nhận điều khoản. AdsSync mới chỉ có (1). Schema đã có `users.phoneVerifiedAt` nhưng KHÔNG dùng để chặn. |
| 2 | **Chấp nhận điều khoản sử dụng** | ⚠️ Cao | done.vn có màn "Điều khoản sử dụng" + lưu mốc đồng ý. AdsSync không có (không thấy route/UI `terms`). |
| 3 | **Mã khuyến mã FREE100 (gói 3 tháng miễn phí)** | 🟡 Trung bình | done.vn có banner "dùng mã FREE100 để kích hoạt gói 3 tháng". AdsSync có hệ promo nhưng không có mã khởi tạo sẵn. |
| 4 | **Hiện Token AI (Token in / Token out)** | 🟡 Thấp | AdsSync có cột "Token AI · tháng này" trong sidebar và đọc `tokenUsage` trong `reports.ts` → chỉ thiếu phần hiển thị số token ở góc sidebar như done.vn. |
| 5 | **Trang trải nghiệm/hướng dẫn cho user mới** | 🟡 Thấp | done.vn có 1 trang onboarding tổng hợp 3 bước + "Thứ tự nên làm trong ngày đầu tiên". AdsSync có /huong-dan riêng nhưng không có onboarding flow. |
| 6 | **Slug Biz đọc được** | 🟢 Cosmetic | done.vn: `eddy-hu-zkbqe2fgvu9uf1vgzmpa9v27`; AdsSync: `biz-c1db5d8b` (sinh từ user id 8 ký tự). |

### 13.4. Lỗi đã tìm & sửa trong lúc rà soát

| Lỗi | Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|---|
| `/settings/roles` | HTTP 500 | import `PERMISSION_DOCS` từ file `"use client"` → server nhận client-reference (undefined), lỗi `Cannot read properties of undefined (reading 'label')` | Tách sang `src/lib/permissions.ts` (không "use client"), cập nhật 3 file import |
| **Mất phiên đăng nhập mỗi lần mở app** | Cookie phiên chết sau khi restart | `read_or_create_secret` chỉ nhận secret ≥ 32 ký tự, nhưng secret sinh ra chỉ 20 ký tự → **app tạo secret mới mỗi lần chạy** | Sinh secret bằng `BCryptGenRandom` (32 byte = 64 hex), nhận lại secret cũ nếu ≥ 16 ký tự, thêm `bcrypt.lib` vào build.rs |
| `/dashboard/post-triggers` | 404 | Route thật là `/post-triggers/create` (trong command menu) — **KHÔNG phải bug** | — |
| Login Google trong webview | Google chặn user-agent webview | Mở trình duyệt hệ thống qua lệnh Rust `open_external` + bridge chuyển cookie phiên về webview | Đã xong, test thật thành công |

### 13.5. Còn lại chờ bên ngoài

- **TikTok**: app `AdsSync` đã tạo, trạng thái `Pending` (TikTok duyệt tối đa 3 ngày) → có App ID/Secret thì điền vào là nối được
- **Google Ads**: cần Developer Token (xin ở `ads.google.com/manager/api`, duyệt tay vài ngày)
- **Meta**: 4 quyền publish/message chưa xin được (cần Quickstart với Site URL là domain thật) + App Review để đọc TKQC ngoài quyền admin

---

## 14. Phiên 2026-10-22 (lần 2): quyền kết nối, AI-first, tính năng còn thiếu

### 14.1. Nguyên nhân gốc lỗi "Sorry, something went wrong" (Meta) — đã sửa 3 tầng

Ba nguyên nhân độc lập cùng gây lỗi:

1. **OAuth chạy trong webview.** Link `<a href="/api/connect/meta/start">` điều hướng
   ngay trong webview Tauri. Facebook chặn user-agent webview nhúng → hiện trang lỗi.
   *Sửa:* `src/lib/open-external.ts` — mọi nút OAuth gọi IPC `open_external` để mở
   tab trình duyệt hệ thống.

2. **`business_management` cần Business Portfolio.** App Meta chưa gắn portfolio thì
   Facebook từ chối cả dialog, kể cả các quyền hợp lệ.
   *Sửa:* `defaultScopeKeys("meta")` không còn `business_management`; quyền này vẫn
   cấp được sau khi tạo portfolio (nút "Cấp quyền đã chọn").

3. **Không xử lý `?error=` của Facebook.** Facebook báo lỗi qua query param, không qua
   HTTP status → trước đây người dùng thấy JSON lạ hoặc trang trắng.
   *Sửa:* cả 3 callback (Meta/Google/TikTok) bắt `error` + `error_description` và
   redirect về `/dashboard/connections?error=...` kèm thông báo tiếng Việt.

### 14.2. Registry quyền (src/lib/oauth-scopes.ts)

Scope không còn nằm rời rạc trong route. Một registry duy nhất cho Meta (14 quyền),
Google (6), TikTok (4), Sheets (2). Mỗi scope có: key, nhãn tiếng Việt, mô tả,
nhóm tính năng, cờ `needsReview` (quyền cần App Review).

| Nơi dùng | Việc |
|---|---|
| `start/route.ts` x3 | dựng URL OAuth dialog từ registry |
| `callback/route.ts` x3 | đối chiếu scope provider trả về, lưu `grantedScopes` + `missingScopes` vào connection |
| `providers.ts` (`checkHealth` Meta) | đọc `/debug_token` để biết quyền thật của token |
| `GET /api/biz/:slug/connections/:id/scopes` | trả về quyền đã cấp / thiếu / cần duyệt |
| `POST /api/biz/:slug/connections/:id/scopes` | sinh URL cấp thêm quyền (re-authorize) |
| `GET /api/biz/:slug/connections/diagnose` | checklist cấu hình (app id, redirect URI, Business Portfolio, Developer Token, MCC) |

UI: cột "Quyền" trong bảng kết nối + modal **Quyền & tài khoản** (chọn quyền thiếu,
xem tài khoản quảng cáo / fanpage / pixel, checklist cấu hình, cảnh báo thiếu
Developer Token).

### 14.3. Sửa lỗi kỹ thuật Google Ads (trước đây mọi lệnh Ads sẽ fail sau 1 giờ)

| Lỗi | Nguyên nhân | Sửa |
|---|---|---|
| Token không refresh | `client_id`/`client_secret` không được lưu vào connection → nhánh refresh không bao giờ chạy | Lưu vào `secret` lúc callback; `googleAdsAuth()` tự refresh + ghi lại token mới |
| Thiếu `login-customer-id` | Query tài khoản con của MCC luôn fail | `googleAdsAuth()` trả `loginCustomerId`; mọi request gắn header |
| Developer Token rỗng | `listAccessibleCustomers` cần header này | Lưu token vào connection + cảnh báo rõ ràng trong UI |
| Tên tài khoản thiếu | Chỉ lấy resourceNames, không query `customer` | Query thêm `descriptive_name`, `currency_code`, `manager`, `status` |
| `DEV_TOKEN_PLACEHOLDER` | Placeholder được gửi thẳng lên API | Đã thay bằng token thật, thiếu thì báo lỗi rõ |

### 14.4. Meta: lấy đủ tài khoản quảng cáo

`checkHealth("meta_ads")` giờ đọc:
- `/me/adaccounts` (tài khoản của profile đang đăng nhập)
- `/me/businesses` → `/businesses/{id}/owned_adaccounts` (tài khoản thuộc business —
  trường hợp phổ biến với agency, trước đây bị bỏ sót)
- `/me/accounts` (fanpage + Instagram gắn với)
- `/me/adpixels` (pixel)
- `/debug_token` (scope thật của token)

### 14.5. MCP: OAuth 2.1 để AI khác kết nối trực tiếp (AI-first)

Thêm OAuth 2.1 + PKCE cho MCP server. ChatGPT (và MCP client chuẩn khác) không cần
copy API key, chỉ cần URL server là đăng nhập được.

| Endpoint | Vai trò |
|---|---|
| `GET /mcp/oauth/metadata` | metadata authorization server (issuer, endpoints, scope hỗ trợ) |
| `GET /.well-known/oauth-protected-resource` | protected resource metadata (MCP spec) |
| `POST /mcp/oauth/register` | dynamic client registration (DCR) |
| `GET/POST /mcp/oauth/authorize` | màn chọn API key MCP + duyệt, sinh authorization code |
| `POST /mcp/oauth/token` | đổi code (có PKCE) / refresh token |
| `POST /mcp` | nhận `Authorization: Bearer <token>` bên cạnh `?key=` |

Bảng mới: `mcp_oauth_clients`, `mcp_oauth_tokens`, `mcp_oauth_codes`
(migration `drizzle/0008_mcp_oauth.sql`).

Token gắn với một MCP key có sẵn → quyền đọc/ghi, bộ chỉ số và skill đều theo key đó.
**Mọi lệnh ghi vẫn phải qua Approval Gate** — AI tạo yêu cầu, người duyệt trong app.

Đã test end-to-end (script `test-mcp-oauth-e2e.cjs`):
DCR → authorize → code → token (PKCE) → tools/list (17 tools) → initialize →
refresh token → sai PKCE bị từ chối → dùng lại code bị từ chối.

### 14.6. Tool MCP: thêm Google Ads + thiếu Meta (17 → 27 tools)

| Tool mới | Nhóm |
|---|---|
| `google_ads_get_accounts` | Google Ads |
| `google_ads_get_campaigns` | Google Ads |
| `google_ads_get_insights` | Google Ads |
| `google_ads_get_campaign_details` | Google Ads |
| `meta_get_post_details` | Meta |
| `meta_get_page_posts` | Meta |
| `meta_get_pixels` | Meta |

MCP key giờ có scope riêng từng nền tảng (`meta_ads` / `google_ads` / `tiktok_ads`:
read | all | none) — chọn trong form tạo key. Key read-only không thấy tool ghi.

### 14.7. Đăng nhập bằng ChatGPT (OpenAI OAuth)

`src/lib/auth-openai.ts` — provider OAuth của OpenAI
(`auth.openai.com/oauth/authorize`, `api.openai.com/v1/user`). Bật khi có
`OPENAI_CLIENT_ID` + `OPENAI_CLIENT_SECRET` (thêm vào Cài đặt → Ứng dụng OAuth).

Bridge đăng nhập desktop tổng quát hoá: `POST /api/desktop/auth-bridge?provider=google|openai`,
trang launch nhận `provider` và trỏ đúng form signin. Nút "Đăng nhập với ChatGPT" xuất
hiện ở trang login khi provider đã cấu hình.

### 14.8. Giao diện: bù các phần thiếu so với done.vn

| Việc | Chi tiết |
|---|---|
| Sidebar | Bổ sung nhóm **Kết nối**, **Phân tích** (Báo cáo, Nhật ký), **MCP Server** (API key MCP, Bộ chỉ số, Skill Hub) + mục **Mẫu quảng cáo** — đúng như done.vn |
| Dark mode | Nút trên header trước đây là stub, không có handler. Nay dùng `src/lib/use-theme.ts` + token CSS (`[data-theme=dark]`), script chạy trước paint để không nháy trắng |
| Skill Hub | Tab "Của tôi" / "Nền tảng đề xuất" và ô tìm kiếm trước đây không có `onClick`/`onChange` → nay hoạt động |
| Bảng kết nối | Thêm cột "Quyền", modal Quyền & tài khoản, thông báo kết nối thành công/thất bại từ query param |
| Panel MCP | Tab chọn cách kết nối: **ChatGPT (OAuth)** hoặc **Claude / Cursor (API key)** |

### 14.9. FREE100 — không có trong AdsSync, và sẽ không thêm

Đã kiểm tra bảng `announcements` trong DB bản desktop: **0 dòng**. Không có banner
promo, không có mã khuyến mại nào được copy từ done.vn. Bản desktop không tính phí
nên cũng không cần gói cước để kích hoạt.

### 14.10. Số đo thực tế (2026-10-22, bản cài 41.39 MB)

| Chỉ số | Giá trị đo được |
|---|---|
| Cài đặt | 203.4 MB (resources 110.3 MB, node runtime 88.5 MB) |
| Tiến trình | Tauri shell 55.9 MB + Next server 333.2 MB RAM |
| Khởi động server | 289–525 ms ("Ready in") |
| Render trang | 99–426 ms; `/reports` 1.1 s (nặng nhất, 158 KB HTML) |
| Route | 37 page + 74 API route |
| MCP tools | 27 (19 Meta, 4 Google, 3 TikTok, 1 AdsSync) + custom tools |
| OAuth MCP | 6 endpoint, PKCE bắt buộc, refresh token 1 giờ |
### 14.11. Dark mode — codemod thay hardcode màu

Cách làm: mọi màu nền cứng (`#fff`, `#f3f7fd`, `#f8fafd`…) trong 36 file component
được đổi sang token CSS (`var(--card)`, `var(--surface-3)`, `var(--surface-2)`…).
Codemod nằm ở `scripts/codemod/dark-theme.mjs` — chạy lại được, không sửa logic.

Các class Tailwind còn dùng màu cứng được phủ bằng selector `[data-theme="dark"] .bg-white`
(và các class tương tự) trong `globals.css`, có specificity cao hơn utility của Tailwind.

Kiểm chứng bằng ảnh chụp thật trên cả hai chế độ (light + dark) ở 3 màn: Tổng quan,
Kết nối, MCP Server.

---

## 15. Chuyển sang production (đọc thật / ghi thật)

### 15.1. Chế độ dữ liệu — `%APPDATA%\AdsSync\mode.env`

App tạo file này ở lần chạy đầu. Sửa rồi khởi động lại app:

```env
# 1 = dữ liệu mô phỏng (mặc định, an toàn); 0 = gọi API quảng cáo thật
ADSYNC_MOCK=0
# 1 = cho phép ghi thật lên tài khoản quảng cáo (vẫn qua Approval Gate)
ADSYNC_REAL_WRITES=0
```

- `ADSYNC_MOCK=0`: số liệu, danh sách chiến dịch, tài khoản lấy từ Meta/Google/TikTok thật.
- `ADSYNC_REAL_WRITES=1`: mở khoá các lệnh ghi (tắt/bật, đổi ngân sách, tạo campaign,
  đăng bài, trả lời bình luận). Mọi helper ghi đều đi qua `src/lib/write-guard.ts`;
  khi cờ = 0, lệnh bị chặn kể cả từ worker/MCP, không chỉ từ UI.
- OAuth sandbox (`?mock=1`) chỉ hoạt động khi `ADSYNC_MOCK=1`. Ở production, thiếu
  credential sẽ trả 503 thay vì tự tạo kết nối giả.

### 15.2. Điều kiện để khách hàng kết nối OAuth

| Nền tảng | Điều kiện production | Trạng thái hiện tại |
| --- | --- | --- |
| Meta Ads | App chuyển **Live**, Advanced Access (App Review) cho `ads_read`, `ads_management`, `pages_show_list`, `pages_read_engagement`; Business Verification; App Domains + Privacy Policy URL | App đang Development mode — chỉ Admin/Tester kết nối được |
| Google Ads | Bật `https://www.googleapis.com/auth/adwords` trong OAuth consent screen; có **Developer Token**; publish/verify consent screen | Đã có OAuth client; **thiếu Developer Token** |
| TikTok Ads | App được TikTok duyệt, có App ID/Secret | App đang chờ duyệt |

Chừng nào các điều kiện trên chưa xong, luồng đúng là: admin/test tự kết nối để kiểm thử,
khách hàng dùng access token thủ công (fallback) — không thể vượt qua chính sách của nền tảng bằng code.

### 15.3. Test end-to-end

```powershell
# App desktop đang chạy, mock mode bật
node scripts/test-connections-e2e.mjs --create-mock

# Sau khi đã có kết nối thật + ADSYNC_MOCK=0
node scripts/test-connections-e2e.mjs
```

Script tự ký phiên đăng nhập từ `%APPDATA%\AdsSync\secret.txt`, kiểm tra: session,
diagnose từng provider, URL OAuth, tạo/xoá kết nối sandbox, đọc sources + query số liệu,
scopes, recheck và MCP OAuth metadata. Kết nối do script tạo sẽ được xoá ở cuối.