"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  IconBolt,
  IconBook,
  IconChart,
  IconCopy,
  IconGrid,
  IconKey,
  IconPlug,
  IconSearch,
  IconSparkle,
} from "../icons";

type Step = { title: string; body: string; tip?: string };
type Article = {
  id: string;
  group: string;
  title: string;
  icon: "key" | "chart" | "bolt" | "book" | "plug" | "grid";
  intro: string;
  steps: Step[];
};

const ICONS = {
  key: IconKey,
  chart: IconChart,
  bolt: IconBolt,
  book: IconBook,
  plug: IconPlug,
  grid: IconGrid,
} as const;

const ARTICLES: Article[] = [
  {
    id: "ket-noi",
    group: "Bắt đầu",
    title: "Kết nối tài khoản",
    icon: "plug",
    intro: "Ba bước bắt buộc trước khi bảng chỉ số có dữ liệu, và thứ tự nên làm sau đó.",
    steps: [
      {
        title: "Mở mục Kết nối",
        body:
          "Vào Kết nối (menu avatar góc phải) → “+ Thêm kết nối” → chọn nền tảng. Meta và TikTok có thể uỷ quyền OAuth một chạm; Google cần credential riêng.",
      },
      {
        title: "Dán token hoặc bấm uỷ quyền",
        body:
          "Meta: token cần quyền ads_read, ads_management, pages_read_engagement. TikTok: Marketing API token. Google: developer token + refresh token + customer ID.",
        tip:
          "Meo. Sau khi thêm, bấm “Làm mới” để hệ thống tự tải danh sách tài khoản quảng cáo và fanpage. Token chỉ lưu trên máy bạn.",
      },
      {
        title: "Kiểm tra trạng thái",
        body:
          "Cột Trạng thái hiển thị Hoạt động / Sắp hết hạn / Lỗi. Bấm ⋯ → “Kiểm tra ngay” để chạy lại health check bất cứ lúc nào.",
      },
    ],
  },
  {
    id: "chi-so",
    group: "Chỉ số quảng cáo",
    title: "Xem chỉ số quảng cáo",
    icon: "chart",
    intro: "Bảng hợp nhất số liệu nhiều nền tảng, mỗi người tự cấu hình cột của mình.",
    steps: [
      {
        title: "Chọn nền tảng và khoảng ngày",
        body:
          "Chỉ số quảng cáo → Hiển thị kết quả: chọn chip nền tảng ở trên cùng, rồi chọn khoảng ngày ở nút lịch (Hôm nay, 7 ngày qua, Tháng này… hoặc Tuỳ chỉnh).",
      },
      {
        title: "Chọn cấp dữ liệu và bộ lọc",
        body:
          "Segmented đầu tiên đổi giữa Chiến dịch / Nhóm quảng cáo / Quảng cáo. Bên phải lọc theo trạng thái, tìm theo tên hoặc ID, giới hạn tài khoản.",
        tip:
          "Meo. “Tất cả tài khoản” cho phép chọn tối đa 12 tài khoản mỗi lần xem; chọn ít tài khoản sẽ tải nhanh hơn.",
      },
      {
        title: "Cấu hình cột hiển thị",
        body:
          "Nút cột (biểu tượng bảng) mở danh sách chỉ số, bật “Gộp tài khoản”, đánh dấu cột chính và tạo trường công thức. Cấu hình chỉ áp dụng cho tài khoản của bạn.",
      },
    ],
  },
  {
    id: "autopilot",
    group: "Tự động hoá",
    title: "Tự động hoá",
    icon: "bolt",
    intro: "Bốn loại cấu hình chạy ngầm, tất cả lệnh ghi đều qua Approval Gate.",
    steps: [
      {
        title: "Tất cả cấu hình",
        body:
          "Nơi quản lý 4 loại: Kéo chỉ số, Ads Autopilot, Tăng giảm ngân sách và Tự động chạy ads. Mỗi cấu hình có lịch chạy riêng và trạng thái bật/tắt.",
      },
      {
        title: "Ngưỡng CPA",
        body:
          "Đặt giới hạn theo mục tiêu. Autopilot chỉ tắt quảng cáo khi vượt ngưỡng và không nằm trong danh sách bảo vệ.",
        tip:
          "Meo. Chạy thử ở chế độ mô phỏng trước: hệ thống ghi lại lệnh sẽ thực hiện nhưng không gọi API thật.",
      },
      {
        title: "Approval Gate",
        body:
          "Mọi lệnh ghi lên tài khoản thật đều phải được duyệt trong Nhật ký phê duyệt. Bật chế độ thật bằng biến môi trường ADSYNC_REAL_WRITES=1.",
      },
    ],
  },
  {
    id: "bao-cao",
    group: "Chỉ số quảng cáo",
    title: "Báo cáo",
    icon: "book",
    intro: "11 nhóm số liệu, tự gộp theo giờ, ngày hoặc tháng theo độ dài khoảng chọn.",
    steps: [
      {
        title: "Chọn khoảng thời gian",
        body:
          "Báo cáo → chọn khoảng ngày. Hệ thống tự gộp theo giờ (≤1 ngày), theo ngày (≤62 ngày) hoặc theo tháng.",
      },
      {
        title: "Đọc các nhóm số liệu",
        body:
          "Hiệu suất, chi phí, chuyển đổi, tương tác, nội dung, đội ngũ, AI, MCP, hệ thống, bán hàng và cảnh báo — mỗi nhóm có bảng riêng kèm xu hướng so với kỳ trước.",
      },
    ],
  },
  {
    id: "mcp",
    group: "AI & MCP",
    title: "MCP & AI",
    icon: "key",
    intro: "Đưa dữ liệu quảng cáo cho Claude Desktop, Cursor hoặc agent nội bộ qua MCP.",
    steps: [
      {
        title: "Tạo API key",
        body:
          "API key MCP → “Tạo key”. Chuỗi key chỉ hiện một lần. Gắn bộ chỉ số riêng và skill để giới hạn dữ liệu trả về.",
      },
      {
        title: "Dán connector URL",
        body:
          "Endpoint: http://localhost:3000/mcp?key=<API_KEY>. Dán vào Claude Desktop > Connectors > Add, hoặc file claude_desktop_config.json.",
        tip: "Meo. Nút “Log realtime” cho thấy từng lượt gọi tool, thời gian phản hồi và lỗi nếu có.",
      },
      {
        title: "Duyệt lệnh ghi",
        body:
          "Key có quyền ghi sẽ yêu cầu phê duyệt từng lệnh trong Nhật ký phê duyệt trước khi chạm vào tài khoản thật.",
      },
    ],
  },
  {
    id: "desktop",
    group: "Ứng dụng",
    title: "Chạy như ứng dụng desktop",
    icon: "grid",
    intro: "Bản desktop đóng gói sẵn server và worker, dữ liệu nằm trên máy bạn.",
    steps: [
      {
        title: "Cài và mở app",
        body:
          "Bản desktop đóng gói Next.js standalone + worker, dữ liệu lưu tại %APPDATA%\\AdsSync (PGlite). Không cần internet để mở app.",
      },
      {
        title: "Sao lưu dữ liệu",
        body:
          "Toàn bộ dữ liệu nằm trong thư mục .pgdata. Sao chép thư mục này là đủ để sao lưu hoặc chuyển máy.",
      },
    ],
  },
];

export function GuideClient({ slug }: { slug: string }) {
  const [active, setActive] = useState(ARTICLES[0].id);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const a of ARTICLES) {
      if (q && !`${a.title} ${a.intro}`.toLowerCase().includes(q.toLowerCase())) continue;
      const list = map.get(a.group) ?? [];
      list.push(a);
      map.set(a.group, list);
    }
    return [...map.entries()];
  }, [q]);

  const article = ARTICLES.find((a) => a.id === active) ?? ARTICLES[0];
  const Icon = ICONS[article.icon];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${article.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div>
        <h1 className="ui-h1">Hướng dẫn sử dụng</h1>
        <p className="ui-sub mt-2 max-w-[720px]">
          Toàn bộ cách dùng hệ thống, từ bước kết nối đầu tiên tới lúc để AI chạy thay bạn.
        </p>
      </div>

      <section className="ui-card mt-4 overflow-hidden p-0">
        <div className="grid lg:grid-cols-[246px_minmax(0,1fr)]">
          {/* Mục lục */}
          <nav className="border-b p-3 lg:border-b-0 lg:border-r" style={{ borderColor: "var(--line)" }}>
            <label className="relative block">
              <IconSearch
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--ink-400)" }}
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm trong hướng dẫn…"
                className="h-9 w-full rounded-xl border bg-[var(--card)] pl-9 pr-3 text-[13px] outline-none focus:ring-2"
                style={{ borderColor: "var(--line)" }}
              />
            </label>

            <div className="mt-3">
              {groups.map(([group, items]) => (
                <div key={group} className="mb-2">
                  <div
                    className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ink-400)" }}
                  >
                    {group}
                  </div>
                  {items.map((a) => {
                    const on = a.id === article.id;
                    const RowIcon = ICONS[a.icon];
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setActive(a.id);
                          setCopied(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-left text-[13px] transition-colors"
                        style={
                          on
                            ? { background: "var(--brand-soft)", color: "var(--brand)", fontWeight: 600 }
                            : { color: "var(--ink-700)" }
                        }
                      >
                        <RowIcon size={15} style={{ color: on ? "var(--brand)" : "var(--ink-400)" }} />
                        <span className="truncate">{a.title}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {groups.length === 0 && (
                <p className="px-2 py-4 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
                  Không tìm thấy mục nào.
                </p>
              )}
            </div>

            <div
              className="mt-3 border-t px-2 pt-3 text-[11.5px]"
              style={{ borderColor: "var(--line)", color: "var(--ink-400)" }}
            >
              {ARTICLES.length} mục · {new Set(ARTICLES.map((a) => a.group)).size} nhóm
            </div>
          </nav>

          {/* Nội dung */}
          <div className="p-6">
            <div className="flex items-start gap-3">
              <span
                className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
              >
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <h2 className="text-[22px] font-bold leading-tight" style={{ color: "var(--ink-900)" }}>
                  {article.title}
                </h2>
                <p className="mt-1 text-[13.5px]" style={{ color: "var(--ink-500)" }}>
                  {article.intro}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={copyLink}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium"
              style={{ borderColor: "var(--line-strong)", color: "var(--ink-700)" }}
            >
              <IconCopy size={13} />
              {copied ? "Đã chép link" : "Chép link mục này"}
            </button>

            <div className="mt-4 space-y-2.5">
              {article.steps.map((s, i) => (
                <div key={s.title} className="rounded-xl border p-3.5" style={{ borderColor: "var(--line)" }}>
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold text-white"
                      style={{ background: "var(--brand)" }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold" style={{ color: "var(--ink-900)" }}>
                        {s.title}
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--ink-600)" }}>
                        {s.body}
                      </p>
                      {s.tip && (
                        <div
                          className="mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px] leading-relaxed"
                          style={{ background: "var(--brand-soft)", color: "var(--ink-700)" }}
                        >
                          <IconSparkle size={14} style={{ color: "var(--brand)", marginTop: 2, flexShrink: 0 }} />
                          <span>{s.tip}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link href={`/biz/${slug}/dashboard/support`} className="ui-btn">
                Cần hỗ trợ thêm?
              </Link>
              <Link href={`/biz/${slug}/dashboard/connections`} className="ui-btn">
                Mở Kết nối
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
