# Security Policy

## Mô hình tin cậy

AdsSync chạy **trên máy của bạn** (web self-host hoặc desktop) và giữ credential của các
tài khoản quảng cáo. Vì vậy:

- Server chỉ bind `127.0.0.1`. Không expose ra Internet nếu chưa có reverse proxy + auth.
- Dữ liệu (PGlite) và secret NextAuth nằm trong thư mục dữ liệu của bạn
  (mặc định `./.pgdata`, bản desktop `%APPDATA%\AdsSync`).
- Không có telemetry, không gửi dữ liệu về máy chủ của dự án.

## Hai lớp chặn ghi

1. **Mock mode** — `ADSYNC_MOCK=1` (bản desktop luôn bật): adapter trả dữ liệu tổng hợp và
   không thực hiện request ghi nào lên nền tảng.
2. **Approval Gate** — khi bật ghi thật (`ADSYNC_REAL_WRITES=1`), mọi lệnh ghi đến từ MCP
   (tắt/bật campaign, đổi ngân sách, đăng bài, reply comment, custom tool có side effect)
   chỉ tạo bản ghi `mcp_approvals` ở trạng thái `pending`. Owner duyệt trong app thì lệnh
   mới thực thi; mọi bước được ghi vào `activity_logs` và `mcp_call_logs`.

## Custom tools

Tool SDK chỉ chạy **HTTP request** theo manifest, không `eval`, không chạy shell. Tuy vậy:

- URL/header do người dùng khai báo → chỉ cài tool từ nguồn bạn tin.
- Tool có side effect nên đặt `requiresApproval: true`.
- Token nên đặt trong biến môi trường và tham chiếu qua `secretRef`, không dán thẳng vào manifest.

## Hardening bổ sung (22/10/2026)

- **Webhook Meta** bắt buộc `X-Hub-Signature-256` HMAC với `META_APP_SECRET`; payload không
  ký bị trả 403. Chặn việc giả comment/bài viết để kích hoạt auto-reply hoặc job quảng cáo.
- **OAuth state** hết hạn sau 10 phút và so sánh chữ ký bằng `timingSafeEqual` (Meta/Google/TikTok).
- **MCP OAuth** bắt buộc PKCE `S256`; DCR và token endpoint có rate limit trong bộ nhớ.
- **Custom tools** kiểm tra SSRF trước khi gọi: chặn localhost, IP private/link-local, metadata
  cloud và DNS trỏ về IP nội bộ; không tự động theo redirect. Bật
  `ADSYNC_ALLOW_PRIVATE_TOOLS=1` nếu thật sự cần endpoint nội bộ.
- **Skill zip** giới hạn 2MB sau giải nén và kiểm tra biên offset — chống zip bomb/archive hỏng.
- **Bootstrap và auth bridge** chỉ nhận request loopback (kể cả khi có header proxy), tránh lộ
  seed/session qua tunnel.
- **Health** không trả `pid`/`data_dir` cho request không phải loopback.
- **Secret NextAuth** không còn nằm trong `.env` đóng gói; shell desktop sinh và lưu riêng.
- **Migration** tự sao lưu PGlite (`%APPDATA%\AdsSync.bak`) trước khi áp migration mới.
- **Log** xoay vòng khi vượt 10MB; fetch ra provider có timeout mặc định 20s.
- **Backup thủ công**: `Cài đặt → Dữ liệu của bạn → Tải bản sao lưu` (chỉ owner, PGlite).

## Chưa đạt mức production đầy đủ

- Installer chưa **code-sign** (Windows SmartScreen sẽ cảnh báo).
- Chưa có **auto-update** và **tray**; cần server phát hành + chứng chỉ ký.
- Chưa có rate limit phân tán, audit log chống sửa, và HA — phù hợp self-host một máy.
- Nếu mở qua tunnel, phải đặt reverse proxy có HTTPS + auth; các endpoint desktop đã chặn
  loopback nhưng MCP/OAuth vẫn nên được bảo vệ thêm ở tầng proxy.
- Một cảnh báo PostCSS trong dependency của Next 15 chưa nâng lên Next 16 (breaking change);
  app không xử lý CSS do người dùng nhập nên không khai thác được trong luồng hiện tại.

## Báo lỗi

Mở issue riêng tư hoặc email cho maintainer kèm: phiên bản, route, cách tái hiện, và mức độ
ảnh hưởng (đọc dữ liệu / ghi tài khoản / RCE). Vui lòng **không** đăng credential thật,
token MCP hay ảnh chụp tài khoản quảng cáo trong issue công khai.

## Phạm vi không xử lý

- Máy đã bị compromise (malware đọc `%APPDATA%`) — ngoài phạm vi.
- Người dùng tự đặt `ADSYNC_MOCK=0` + `ADSYNC_REAL_WRITES=1` rồi duyệt lệnh sai.
