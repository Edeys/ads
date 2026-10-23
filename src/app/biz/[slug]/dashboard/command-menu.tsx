"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { IconSearch } from "./icons";

export function CommandMenu({ slug, variant = "header" }: { slug: string; variant?: "header" | "sidebar" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const items = [
    { label: "Tổng quan Dashboard", href: `/biz/${slug}/dashboard`, category: "Điều hướng" },
    { label: "Cấu hình tự động hoá (Configs)", href: `/biz/${slug}/dashboard/configs`, category: "Điều hướng" },
    { label: "Quản lý kết nối (Connections)", href: `/biz/${slug}/dashboard/connections`, category: "Điều hướng" },
    { label: "Bình luận Facebook (trả lời / ẩn / rule tự động)", href: `/biz/${slug}/dashboard/comments`, category: "Social" },
    { label: "Đăng bài tự động (composer + lịch đăng)", href: `/biz/${slug}/dashboard/publisher`, category: "Social" },
    { label: "n8n & Webhooks (event outbound)", href: `/biz/${slug}/dashboard/n8n`, category: "Tự động" },
    { label: "Cài đặt ngưỡng CPA (Autopilot)", href: `/biz/${slug}/dashboard/cpa`, category: "Điều hướng" },
    { label: "Lịch tăng giảm ngân sách", href: `/biz/${slug}/dashboard/budget-schedule`, category: "Điều hướng" },
    { label: "Tạo Post Trigger chiến dịch", href: `/biz/${slug}/dashboard/post-triggers/create`, category: "Tự động" },
    { label: "Quick Ads (Lên ads nhanh)", href: `/biz/${slug}/dashboard/quick-ads`, category: "Tự động" },
    { label: "MCP API Keys (Claude Desktop / Cursor)", href: `/biz/${slug}/dashboard/mcp-keys`, category: "AI & MCP" },
    { label: "Báo cáo hiệu quả & chi phí", href: `/biz/${slug}/dashboard/reports`, category: "Báo cáo" },
    { label: "Nhật ký hoạt động (Audit log)", href: `/biz/${slug}/dashboard/activity`, category: "Báo cáo" },
    { label: "Gói cước & Hạn mức Quota", href: `/biz/${slug}/settings/billing`, category: "Cài đặt" },
    { label: "Cài đặt Biz, Thành viên & Phân quyền", href: `/biz/${slug}/settings`, category: "Cài đặt" },
    { label: "Hướng dẫn sử dụng toàn diện", href: "/huong-dan", category: "Hỗ trợ" },
    { label: "Liên hệ hỗ trợ kỹ thuật", href: "/support", category: "Hỗ trợ" },
  ];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = query.trim()
    ? items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()) || i.category.toLowerCase().includes(query.toLowerCase()))
    : items;

  function handleSelect(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      {variant === "sidebar" ? (
        <button
          onClick={() => setOpen(true)}
          className="flex h-[34px] w-full items-center gap-2 rounded-[9px] border px-2.5 text-[13px] transition-colors hover:bg-[var(--surface-2)]"
          style={{ borderColor: "var(--line)", background: "var(--surface-2)", color: "var(--ink-400)" }}
        >
          <IconSearch size={16} />
          <span className="flex-1 text-left">Tìm kiếm…</span>
          <kbd
            className="rounded-[5px] border px-1.5 py-0.5 text-[10px] font-medium"
            style={{ borderColor: "var(--line-strong)", color: "var(--ink-400)", background: "var(--card)" }}
          >
            Ctrl K
          </kbd>
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[13px] transition-colors hover:bg-[var(--surface-2)]"
          style={{ borderColor: "var(--line)", color: "var(--ink-400)" }}
        >
          <IconSearch size={15} />
          <span>Tìm nhanh tính năng…</span>
          <kbd
            className="rounded-[5px] border px-1.5 py-0.5 text-[10px] font-medium"
            style={{ borderColor: "var(--line-strong)", color: "var(--ink-400)" }}
          >
            ⌘K
          </kbd>
        </button>
      )}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed left-1/2 top-1/4 z-50 w-[min(560px,94vw)] -translate-x-1/2 overflow-hidden rounded-[14px] border"
            style={{ background: "var(--card)", borderColor: "var(--line)", boxShadow: "var(--shadow-pop)" }}
          >
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
              <IconSearch size={16} style={{ color: "var(--ink-400)" }} />
              <input
                autoFocus
                placeholder="Nhập tên trang hoặc tính năng cần tìm…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-[14px] outline-none"
                style={{ color: "var(--ink-900)" }}
              />
              <span className="text-[10px] font-mono" style={{ color: "var(--ink-400)" }}>
                ESC
              </span>
            </div>

            <div className="ui-scroll max-h-72 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-[13px]" style={{ color: "var(--ink-400)" }}>
                  Không tìm thấy kết quả phù hợp.
                </div>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.href}
                    onClick={() => handleSelect(item.href)}
                    className="flex w-full items-center justify-between gap-3 rounded-[9px] px-3 py-2 text-left transition-colors hover:bg-[var(--brand-soft)]"
                  >
                    <span className="text-[13.5px] font-medium" style={{ color: "var(--ink-800)" }}>
                      {item.label}
                    </span>
                    <span
                      className="shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-semibold"
                      style={{ background: "var(--surface-3)", color: "var(--ink-500)" }}
                    >
                      {item.category}
                    </span>
                  </button>
                ))
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
