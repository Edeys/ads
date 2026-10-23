// Mô tả 18 quyền của hệ thống (dùng chung cho server component và client component).
//
// Lưu ý: file này KHÔNG được đánh dấu "use client" — nếu để trong file client thì
// server component import sẽ nhận client-reference (undefined) và gây lỗi
// "Cannot read properties of undefined (reading 'label')" khi render.
import type { Permission } from "@/db/schema";

export const PERMISSION_DOCS: Record<Permission, { label: string; desc: string; sensitive?: boolean }> = {
  "jobs.access": { label: "Quản lý job đồng bộ", desc: "Xem, bật/tắt, xoá các cấu hình đồng bộ" },
  "credentials.access": { label: "Quản lý kết nối", desc: "Thêm, sửa, xoá kết nối nền tảng & API key" },
  "post_triggers.access": { label: "Quản lý Post Trigger", desc: "Cấu hình tự động bất biến vì chiến dịch" },
  "mcp_keys.access": { label: "Quản lý MCP key", desc: "Tạo, xoá API key cho MCP server" },
  "budget_schedules.access": { label: "Lịch giảm ngân sách", desc: "Tạo & quản lý lịch giảm ngân sách" },
  "billing.view": { label: "Xem thanh toán", desc: "Xem gói cước, hoá đơn" },
  "billing.manage": { label: "Quản lý thanh toán", desc: "Nâng cấp, huỷ gói, mua thêm" },
  "team.manage": { label: "Quản lý thành viên", desc: "Mời, xoá, đổi vai trò thành viên" },
  "org.delete": { label: "Xoá Biz", desc: "Xoá toàn bộ dữ liệu của Biz" },
  "metric_sync.access": { label: "Đồng bộ chỉ số", desc: "Bật/tắt job đồng bộ chỉ số quảng cáo" },
  "auto_pause.access": { label: "Ads Autopilot", desc: "Tự động tạm dừng chiến dịch khi CPA vượt ngưỡng" },
  "quick_ads.access": { label: "Quick Ads", desc: "Tạo chiến dịch nhanh từ mẫu" },
  "mcp_server.access": { label: "MCP server", desc: "Bật/tắt MCP server nội bộ" },
  "bigquery.access": { label: "BigQuery", desc: "Xuất dữ liệu sang BigQuery" },
  "ad_metrics.access": { label: "Chỉ số quảng cáo", desc: "Xem chỉ số quảng cáo đa nền tảng" },
  "comments.access": { label: "Bình luận Facebook", desc: "Đọc & trả lời bình luận" },
  "publisher.access": { label: "Đăng bài tự động", desc: "Đăng bài lên Page theo lịch" },
  "events.access": { label: "Sự kiện & Webhook", desc: "Gửi/nhận sự kiện ra ngoài" },
};
