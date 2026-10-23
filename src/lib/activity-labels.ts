// Nhãn tiếng Việt cho nhật ký hoạt động — dùng chung cho màn Nhật ký và Tổng quan.
export type StatusMeta = { label: string; bg: string; color: string };

const STATUS: Record<string, StatusMeta> = {
  success: { label: "Thành công", bg: "var(--ok-bg)", color: "var(--ok-ink)" },
  error: { label: "Thất bại", bg: "var(--danger-bg)", color: "var(--danger-ink)" },
  failed: { label: "Thất bại", bg: "var(--danger-bg)", color: "var(--danger-ink)" },
  info: { label: "Thông tin", bg: "var(--brand-soft)", color: "var(--brand)" },
  pending: { label: "Chờ duyệt", bg: "var(--warn-bg)", color: "var(--warn-ink)" },
  skipped: { label: "Bỏ qua", bg: "var(--surface-3)", color: "var(--ink-500)" },
};

export function statusMeta(status: string | null | undefined): StatusMeta {
  return STATUS[status ?? "info"] ?? { label: status ?? "—", bg: "var(--surface-3)", color: "var(--ink-500)" };
}

const ACTIONS: Record<string, string> = {
  // cấu hình
  "config.create": "Tạo cấu hình",
  "config.update": "Cập nhật cấu hình",
  "config.delete": "Xoá cấu hình",
  "config.run": "Chạy cấu hình",
  "config.pause": "Tạm dừng cấu hình",
  "config.resume": "Bật lại cấu hình",
  // mẫu quảng cáo
  "ad_template.create": "Tạo mẫu quảng cáo",
  "ad_template.update": "Cập nhật mẫu quảng cáo",
  "ad_template.delete": "Xoá mẫu quảng cáo",
  "ad_template.duplicate": "Nhân bản mẫu quảng cáo",
  // quảng cáo nhanh
  "quick_ads.create": "Đăng quảng cáo nhanh",
  "quick_ads.publish": "Đăng quảng cáo nhanh",
  "quick_ads.fail": "Đăng quảng cáo thất bại",
  // kết nối
  "connection.create": "Thêm kết nối",
  "connection.delete": "Xoá kết nối",
  "connection.check": "Kiểm tra kết nối",
  "connection.refresh": "Làm mới kết nối",
  // whitelist
  "whitelist.add": "Thêm whitelist",
  "whitelist.remove": "Xoá whitelist",
  // MCP
  "mcp_key.create": "Tạo khoá MCP",
  "mcp_key.revoke": "Thu hồi khoá MCP",
  "mcp_key.disable": "Tạm tắt khoá MCP",
  "mcp_key.enable": "Bật khoá MCP",
  "mcp_key.delete": "Xoá khoá MCP",
  "mcp.approve": "Duyệt lệnh MCP",
  "mcp.reject": "Từ chối lệnh MCP",
  // hỗ trợ
  "support.create": "Tạo yêu cầu hỗ trợ",
  "support.update": "Cập nhật hỗ trợ",
  "support.reply": "Trả lời hỗ trợ",
  // tài chính
  "billing.subscribe": "Đăng ký gói",
  "billing.cancel": "Huỷ gói",
  "billing.invoice": "Tạo hoá đơn",
  // nhóm & quyền
  "member.invite": "Mời thành viên",
  "member.remove": "Xoá thành viên",
  "member.update": "Cập nhật thành viên",
  "invite.create": "Gửi lời mời",
  "invite.revoke": "Thu hồi lời mời",
  // job & dữ liệu
  "job.create": "Tạo job",
  "job.run": "Chạy job",
  "job.delete": "Xoá job",
  "budget_schedule.update": "Cập nhật lịch ngân sách",
  "cpa_rule.update": "Cập nhật ngưỡng CPA",
  "metric_sync.run": "Đồng bộ chỉ số",
  // đăng bài & bình luận
  "publisher.create": "Tạo bài đăng",
  "publisher.publish": "Đăng bài",
  "comment.reply": "Trả lời bình luận",
  "comment.hide": "Ẩn bình luận",
  // khác
  "auth.login": "Đăng nhập",
  "biz.update": "Cập nhật Biz",
};

/** Nhãn người đọc được cho một action key. */
export function actionLabel(action: string): string {
  if (ACTIONS[action]) return ACTIONS[action];
  const cleaned = action.replace(/[._-]+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const OBJECTS: Record<string, string> = {
  config: "Cấu hình",
  ad_template: "Mẫu quảng cáo",
  ad_template_group: "Nhóm mẫu",
  campaign: "Chiến dịch",
  adset: "Nhóm quảng cáo",
  ad: "Quảng cáo",
  connection: "Kết nối",
  credential: "Tài khoản QC",
  whitelist: "Whitelist",
  mcp_key: "Khoá MCP",
  mcp_call: "Lượt gọi MCP",
  support_thread: "Hỗ trợ",
  invoice: "Hoá đơn",
  plan: "Gói cước",
  member: "Thành viên",
  invite: "Lời mời",
  job: "Job",
  budget_schedule: "Lịch ngân sách",
  cpa_rule: "Ngưỡng CPA",
  publisher_post: "Bài đăng",
  comment: "Bình luận",
  biz: "Biz",
  user: "Người dùng",
};

export function objectLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return OBJECTS[type] ?? type;
}

/** "20:51 19-10" — giờ trước, ngày sau (định dạng Done.vn dùng). */
export function logTimeCell(iso: string): { time: string; date: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    date: `${pad(d.getDate())}-${pad(d.getMonth() + 1)}`,
  };
}

const DETAIL_KEYS = ["name", "title", "key", "email", "status", "tier", "pages", "runId", "url"];

/** Rút gọn detail thành 1 dòng "khoá: giá trị". */
export function detailSummary(detail: Record<string, unknown> | null | undefined): string {
  if (!detail || typeof detail !== "object") return "—";
  const entries = Object.entries(detail).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return "—";

  const preferred = DETAIL_KEYS.map((k) => entries.find(([key]) => key === k)).filter(Boolean) as [
    string,
    unknown,
  ][];
  const [key, value] = preferred[0] ?? entries[0];
  const text =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : Array.isArray(value)
        ? `${value.length} mục`
        : JSON.stringify(value);
  const extra = entries.length > 1 ? ` +${entries.length - 1}` : "";
  return `${key}: ${text}${extra}`;
}
