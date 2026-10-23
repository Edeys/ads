# Hướng dẫn đóng góp (Contributing to AdsSync)

Chào mừng bạn đến với dự án **AdsSync**! AdsSync là nền tảng quản trị quảng cáo đa kênh, tự động hóa nội dung và phễu tăng trưởng (Growth OS) theo triết lý **Local-First, Self-Hosted & Privacy-First**.

---

## 1. Nguyên tắc phát triển (Engineering Standards)

Dự án tuân thủ nghiêm ngặt các nguyên tắc thiết kế kỹ thuật:
- **Type-Safety & Zero Any**: Toàn bộ codebase được viết bằng TypeScript nghiêm ngặt (`strict: true`). Không ép kiểu `any` ở tầng nghiệp vụ.
- **Model the Domain**: Logic nghiệp vụ được mô hình hóa rõ ràng trong schema database (Drizzle ORM) và TypeScript models trước khi viết code logic.
- **Write-Guard & Safety First**: Mọi thao tác ghi dữ liệu, sửa đổi ngân sách quảng cáo hoặc xuất bản bài viết bắt buộc phải đi qua cơ chế kiểm duyệt (`Write-Guard` / `Approval Gate`).
- **Idempotent Operations**: Mọi job chạy ngầm trong `src/worker/` phải đảm bảo tính bất biến (chạy lại nhiều lần không sinh trùng lặp dữ liệu).

---

## 2. Quy trình thiết lập môi trường phát triển (Local Setup)

### Yêu cầu tiên quyết
- **Node.js**: Phiên bản 20 LTS trở lên.
- **Rust Toolchain**: `rustup` và `cargo` (nếu tham gia phát triển phần Desktop Tauri 2 shell).
- **Trình duyệt**: Hỗ trợ WebView2 (có sẵn trên Windows 10/11).

### Các bước khởi chạy
1. Fork và clone repository về máy:
   ```bash
   git clone https://github.com/Edeys/ads.git
   cd ads
   ```
2. Cài đặt các gói phụ thuộc:
   ```bash
   npm install
   ```
3. Tạo file môi trường phát triển:
   ```bash
   cp .env.example .env.local
   ```
4. Khởi chạy môi trường phát triển Web:
   ```bash
   npm run dev
   # Truy cập tại http://localhost:3000
   ```
5. Chạy thử bản Desktop (không cần Rust):
   ```bash
   npm run desktop:dev
   ```

---

## 3. Quy chuẩn Commit & Pull Request

- Sử dụng định dạng [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat(...)`: Tính năng mới.
  - `fix(...)`: Sửa lỗi.
  - `docs(...)`: Cập nhật tài liệu kỹ thuật.
  - `refactor(...)`: Tái cấu trúc mã nguồn mà không đổi hành vi nghiệp vụ.
  - `chore(...)`: Cập nhật cấu hình, dependencies, script build.
- Mỗi Pull Request cần đính kèm giải thích ngắn gọn lý do thay đổi và xác nhận đã kiểm thử tính năng (`npm run build` thành công).
