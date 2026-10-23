/**
 * Bảng giá gói dịch vụ (dữ liệu tĩnh, dùng cho trang Gói cước & hạn mức).
 */
export type PlanTier = {
  tier: "trial" | "small" | "pro" | "business" | "custom";
  name: string;
  price: number | null;
  period: string;
  quota: { tkqc: number; qlbh: number; staff: number; minSyncMinutes: number };
  features: string[];
};

export const PRICING: PlanTier[] = [
  {
    tier: "trial",
    name: "Dùng thử",
    price: 0,
    period: "14 ngày",
    quota: { tkqc: 3, qlbh: 1, staff: 1, minSyncMinutes: 30 },
    features: ["3 tài khoản quảng cáo", "1 kết nối bán hàng", "1 thành viên", "Đồng bộ 30 phút/lần"],
  },
  {
    tier: "small",
    name: "Khởi nghiệp",
    price: 490000,
    period: "tháng",
    quota: { tkqc: 5, qlbh: 2, staff: 3, minSyncMinutes: 15 },
    features: ["5 tài khoản quảng cáo", "2 kết nối bán hàng", "3 thành viên", "Đồng bộ 15 phút/lần"],
  },
  {
    tier: "pro",
    name: "Chuyên nghiệp",
    price: 990000,
    period: "tháng",
    quota: { tkqc: 15, qlbh: 5, staff: 10, minSyncMinutes: 10 },
    features: [
      "15 tài khoản quảng cáo",
      "5 kết nối bán hàng",
      "10 thành viên",
      "Đồng bộ 10 phút/lần",
      "Autopilot + báo cáo AI",
    ],
  },
  {
    tier: "business",
    name: "Doanh nghiệp",
    price: 1990000,
    period: "tháng",
    quota: { tkqc: 50, qlbh: 20, staff: 50, minSyncMinutes: 5 },
    features: [
      "50 tài khoản quảng cáo",
      "20 kết nối bán hàng",
      "50 thành viên",
      "Đồng bộ 5 phút/lần",
      "MCP + Webhook",
    ],
  },
  {
    tier: "custom",
    name: "Tuỳ chỉnh",
    price: null,
    period: "liên hệ",
    quota: { tkqc: 999, qlbh: 999, staff: 999, minSyncMinutes: 1 },
    features: ["Không giới hạn theo thoả thuận", "Hạ tầng riêng", "Hỗ trợ riêng"],
  },
];
