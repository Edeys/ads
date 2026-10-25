# Adapters mạng xã hội — hướng dẫn đăng ký app (đọc lúc dậy)

Ngày: 25/10/2026. Toàn bộ code adapter + OAuth + UI đã xong và build lên server local.
Việc còn lại của anh: đăng ký app ở từng mạng, điền env (hoặc dán token qua UI), bấm Kết nối.

## Trạng thái tổng quan

| Adapter | Code | Cần app mới? | Đăng được gì |
|---|---|---|---|
| Facebook Page | ✅ sẵn có | Đã có (META_APP_ID) | text + link + 10 ảnh + video |
| Instagram | ✅ MỚI | **Không** — dùng app Meta hiện tại | ảnh/video đầu + caption |
| X (Twitter) | ✅ MỚI | Có | text + link (280 ký tự) |
| LinkedIn | ✅ MỚI | Có | text + link |
| TikTok (đăng bài) | ✅ MỚI | Dùng app TikTok hiện tại, thêm quyền | photo post (1-12 ảnh URL công khai) + caption |
| Threads | ✅ MỚI | Có | text, hoặc ảnh đầu + caption |
| Pinterest | ✅ MỚI | Có | Pin ảnh (photos[0]) + mô tả, lên board |
| CMS WordPress / Webhook | ✅ sẵn có (Content Hub) | — | bài viết dài |

Đề nghị thứ tự làm: **Instagram trước** (0 phút, chỉ thêm permission) → X → LinkedIn → Threads → Pinterest → TikTok (chờ duyệt app lâu nhất).

---

## 1. Instagram — KHÔNG cần đăng ký app mới

Code: `src/lib/social-adapters.ts` → `publishInstagram` (Graph API media + media_publish).
Token: dùng chung connection Meta Ads hiện tại.

Anh cần làm:
1. Vào [developers.facebook.com](https://developers.facebook.com) → app hiện tại (META_APP_ID trong `.env`) → **App permissions** → thêm **`instagram_content_publish`** (và `instagram_basic`) → Submit (permission này cần app review với Meta, nhưng ở chế độ Development app thì admin/tester dùng được ngay).
2. Page Facebook phải đã liên kết **Instagram Business/Creator account** (trong Page settings → Linked accounts). Các page của anh đa số đã có — health check lưu sẵn `instagram{id, username}` trong connection, publisher tự list đích IG kèm theo page.
3. Kết nối lại Meta (màn Kết nối → Meta Ads → Kết nối) để token mới có scope Instagram.

Đích IG tự hiện trong "Đăng bài tự động" dưới dạng `📷 IG @username`.

## 2. X (Twitter)

Code: `publishX` — POST `https://api.twitter.com/2/tweets`.

1. Đăng ký tại [developer.x.com](https://developer.x.com) → tạo Project + App (Free tier được 1.500 tweet/tháng ở mức viết; Basic $200/tháng cho nhiều hơn — dùng Free để thử).
2. App settings → **Set up** User authentication settings:
   - App permissions: **Read and write**
   - Type of App: **Web App, Automated App or Bot**
   - Callback URI / Redirect URL: `http://localhost:3000/api/connect/social/x_twitter/callback`
   - Website URL: `http://localhost:3000` (điền tạm được)
3. Lấy **OAuth 2.0 Client ID** và **Client Secret** (tab Keys and tokens).
4. Điền vào `.env`:
   ```
   X_CLIENT_ID=...
   X_CLIENT_SECRET=...
   ```
5. Restart server (`Stop-ScheduledTask AdsSyncServer; Start-ScheduledTask AdsSyncServer`) → màn Kết nối → nhóm **Mạng xã hội** → X (Twitter) → bấm kết nối.

OAuth đã dựng sẵn PKCE (S256) theo đúng chuẩn X.

## 3. LinkedIn

Code: `publishLinkedIn` — UGC Posts API (`/v2/ugcPosts`), đăng với visibility PUBLIC.

1. Đăng ký tại [developer.linkedin.com](https://developer.linkedin.com) → Create app (cần một LinkedIn Page gắn với app — tạo Page cá nhân/tìm lộ nếu chưa có).
2. Products: thêm **"Share on LinkedIn"** (được duyệt ngay).
3. Auth tab: **Redirect URLs** thêm `http://localhost:3000/api/connect/social/linkedin/callback`.
4. Copy Client ID / Client Secret → `.env`:
   ```
   LINKEDIN_CLIENT_ID=...
   LINKEDIN_CLIENT_SECRET=...
   ```
5. Restart + kết nối như trên. Đích là trang cá nhân anh (urn tự dò); sau này muốn đăng Page LinkedIn thì thêm `urn:li:organization:{id}`.

## 4. Threads

Code: `publishThreads` — container + publish qua `graph.threads.net`.

1. Đăng ký tại [developers.threads.com](https://developers.threads.com) (nút "Create app" — cần tài khoản Threads).
2. Thêm permission **`threads_content_publish`** (kèm `threads_basic`). Redirect URL: `http://localhost:3000/api/connect/social/threads/callback`.
3. `.env`:
   ```
   THREADS_CLIENT_ID=...
   THREADS_CLIENT_SECRET=...
   ```
   (Threads cũng cấp qua app Meta nếu anh tạo trong cùng hệ — biến fallback META_APP_ID/META_APP_SECRET đã được code đọc nếu anh cấu hình app Meta kiểu Threads.)
4. Lưu ý: app mới ở chế độ Development chỉ đăng được lên tài khoản của admin/tester — đủ dùng cá nhân.

## 5. Pinterest

Code: `publishPinterest` — Pins API v5.

1. Đăng ký tại [developers.pinterest.com](https://developers.pinterest.com) → Create app → chọn quyền `pins:write`, `boards:read`, `user_accounts:read` (trial access cấp ngay, hạn mức vừa đủ dùng cá nhân).
2. Redirect URI: `http://localhost:3000/api/connect/social/pinterest/callback`.
3. `.env`:
   ```
   PINTEREST_CLIENT_ID=...
   PINTEREST_CLIENT_SECRET=...
   ```
4. Khi soạn bài, mỗi **board** của anh tự hiện thành một đích `📌 tên board` (server list boards lúc mở trang).

## 6. TikTok (đăng bài organic)

Code: `publishTikTok` — Content Posting API, chế độ PHOTO post kéo ảnh từ URL (`PULL_FROM_URL`) — không cần upload file.

1. Dùng chính app TikTok hiện có (TIKTOK_APP_ID trong `.env`).
2. Vào [business-api.tiktok.com](https://business-api.tiktok.com/portal/app) → app của anh → **Add products** → **Content Posting API**.
3. Thêm scope `video.publish` vào danh sách scope申请 → **Submit for audit**. Content Posting bắt buộc app được duyệt — giai đoạn chờ có thể đăng ở privacy `SELF_ONLY` để test (code đang đặt `PUBLIC_TO_EVERYONE`; nếu bị từ chối, đổi sang SELF_ONLY trong `social-adapters.ts` để thử).
4. Redirect URI TikTok yêu cầu hostname (không nhận 127.0.0.1): thêm `http://localhost:3000/api/connect/social/tiktok/callback` (đã có TIKTOK_REDIRECT_URL riêng cho ads — cái này là URL thứ hai).

---

## Cách toàn bộ hệ thống chạy

- **Soạn 1 bài → tick nhiều đích nhiều mạng** (tối đa 10) trong "Đăng bài tự động". Đăng ngay hoặc lên lịch (worker chạy từng đích, đích lỗi không chặn đích khác — đã test).
- **OAuth từng mạng** qua `/api/connect/social/{mạng}/start?slug=...` (state ký HMAC 15 phút, X dùng PKCE). Callback tự dò user, lưu connection, khôi phục token khi kết nối lại.
- **Token hết hạn**: X/LinkedIn/Pinterest/Threads có refresh token đã lưu trong secret — khi token gần hết hạn (meta.tokenExpiresAt), kết nối lại 1 cú bấm là xong.
- **AI**: giữ nguyên luồng AI viết bài + soát chính sách trước khi đăng.

## Bật đăng THẬT (quan trọng)

App đang ở **chế độ an toàn**: mọi lệnh ghi ra provider (đăng bài, comment…) bị write-guard chặn.
Muốn đăng thật: thêm dòng `ADSYNC_REAL_WRITES=1` vào `.env` rồi restart server (biến đúng tên là `ADSYNC_REAL_WRITES` — xác nhận trong `src/lib/write-guard.ts`). Approval Gate vẫn hoạt động như một lớp nữa.
Khuyến nghị: bật khi nào anh sẵn sàng đăng thật, test trước bằng SELF_ONLY/riêng tư ở từng mạng.

## Danh sách adapter TIỀM NĂNG (chưa code — nói em 1 tiếng là gắn thêm)

| Mạng | API | Ghi chú |
|---|---|---|
| YouTube Shorts | Data API v3 `videos.insert` | cần upload file video, OAuth Google |
| Zalo OA | Zalo OA Open API | đăng bài lên Official Account |
| Telegram Channel | Bot API `sendMessage` | đã có connection Telegram (nhóm Thông báo) — chỉ cần adapter |
| Reddit | API v1 `submit` | text/link post |
| Mastodon | `POST /api/v1/statuses` | đơn giản nhất, token tĩnh |
| Bluesky | atproto `createPost` | app password, không cần OAuth |
| Facebook Group | Graph groups feed | cần app review scope groups_access |
| WordPress.com REST | `posts` | bản CMS hiện đang hỗ trợ self-hosted WP |
