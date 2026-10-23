"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevron, IconHelp, IconMoon, IconSearch, IconSun } from "./icons";
import { NotificationsBell } from "./notifications-bell";
import { useTheme } from "@/lib/use-theme";

export type BizOption = {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
};

export function DashboardHeader({
  currentSlug,
  currentBizName,
  userBizs,
  userEmail,
  userName,
  onSearch,
}: {
  currentSlug: string;
  currentBizName: string;
  userBizs: BizOption[];
  userEmail: string;
  userName: string | null;
  onSearch?: () => void;
}) {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const initial = (userName || userEmail).charAt(0).toUpperCase();

  const iconBtn =
    "flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors hover:bg-[var(--surface-3)]";

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 md:px-4"
      style={{ borderColor: "var(--line)", background: "var(--card)" }}
    >
      {/* Logo */}
      <Link
        href={`/biz/${currentSlug}/dashboard`}
        className="flex shrink-0 items-center gap-2.5 rounded-[10px] pr-1"
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-[9px] text-[14px] font-extrabold text-white"
          style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)" }}
        >
          A
        </span>
        <span className="text-[17px] font-bold tracking-tight" style={{ color: "var(--ink-900)" }}>
          AdsSync
        </span>
      </Link>

      <span className="hidden h-5 w-px shrink-0 md:block" style={{ background: "var(--line)" }} />

      {/* Biz switcher */}
      <div className="relative shrink-0">
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex h-9 max-w-[220px] items-center gap-2 rounded-[10px] border px-2.5 text-[13px] font-semibold transition-colors hover:bg-[var(--surface-2)]"
          style={{ borderColor: "var(--line)", color: "var(--ink-800)" }}
          title="Chuyển Biz"
        >
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-[10px] font-bold"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            {currentBizName.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{currentBizName}</span>
          <IconChevron size={13} style={{ color: "var(--ink-400)", transform: "rotate(90deg)" }} />
        </button>

        {dropdownOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
            <div
              className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border p-1.5"
              style={{ borderColor: "var(--line)", background: "var(--card)", boxShadow: "var(--shadow-pop)" }}
            >
              <div className="px-2 py-1.5 text-[10.5px] font-bold uppercase" style={{ color: "var(--ink-400)" }}>
                Biz của bạn
              </div>
              {userBizs.map((b) => (
                <button
                  key={b.slug}
                  onClick={() => {
                    setDropdownOpen(false);
                    router.push(`/biz/${b.slug}/dashboard`);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--surface-2)]"
                  style={
                    b.slug === currentSlug
                      ? { background: "var(--brand-soft)", color: "var(--brand)" }
                      : { color: "var(--ink-700)" }
                  }
                >
                  <span className="truncate">{b.name}</span>
                  {b.isPersonal && (
                    <span className="shrink-0 text-[10.5px]" style={{ color: "var(--ink-400)" }}>
                      Cá nhân
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex-1" />

      {/* Tìm kiếm nhanh */}
      {onSearch && (
        <button
          type="button"
          onClick={onSearch}
          className="hidden h-9 items-center gap-2 rounded-[10px] border px-3 text-[13px] transition-colors hover:bg-[var(--surface-2)] md:flex"
          style={{ borderColor: "var(--line)", color: "var(--ink-400)" }}
        >
          <IconSearch size={15} />
          <span>Tìm kiếm</span>
          <kbd
            className="ml-2 rounded-[5px] border px-1.5 py-0.5 text-[10.5px] font-medium"
            style={{ borderColor: "var(--line)", color: "var(--ink-400)" }}
          >
            Ctrl K
          </kbd>
        </button>
      )}

      <Link
        href={`/biz/${currentSlug}/dashboard/huong-dan`}
        className={iconBtn}
        style={{ color: "var(--ink-500)" }}
        title="Hướng dẫn"
        aria-label="Hướng dẫn"
      >
        <IconHelp size={18} />
      </Link>

      <NotificationsBell slug={currentSlug} />

      <button
        type="button"
        onClick={toggleTheme}
        className={iconBtn}
        style={{ color: "var(--ink-500)" }}
        title={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
        aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      >
        {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
      </button>

      <div className="relative ml-0.5 flex items-center">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[12.5px] font-bold text-white"
          style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)" }}
          title={userEmail}
        >
          {initial}
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div
              className="absolute right-0 top-full z-50 mt-1.5 w-60 rounded-xl border p-1.5"
              style={{ borderColor: "var(--line)", background: "var(--card)", boxShadow: "var(--shadow-pop)" }}
            >
              <div className="px-2.5 py-1.5">
                <div className="truncate text-[12.5px] font-semibold" style={{ color: "var(--ink-800)" }}>
                  {userName ?? "Người dùng"}
                </div>
                <div className="truncate text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                  {userEmail}
                </div>
              </div>
              <div className="my-1 h-px" style={{ background: "var(--line)" }} />
              {[
                ["Kết nối", `biz/${currentSlug}/dashboard/connections`],
                ["Báo cáo", `biz/${currentSlug}/dashboard/reports`],
                ["Bình luận Facebook", `biz/${currentSlug}/dashboard/comments`],
                ["Nhật ký thao tác", `biz/${currentSlug}/dashboard/activity`],
                ["API key MCP", `biz/${currentSlug}/dashboard/mcp-keys`],
                ["Custom tools", `biz/${currentSlug}/dashboard/tools`],
                ["Tự động đăng bài", `biz/${currentSlug}/dashboard/publisher`],
                ["n8n & Webhook", `biz/${currentSlug}/dashboard/n8n`],
                ["Gói cước & hạn mức", `biz/${currentSlug}/settings/billing`],
                ["Cài đặt Biz", `biz/${currentSlug}/settings`],
              ].map(([label, path]) => (
                <Link
                  key={path}
                  href={`/${path}`}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-2.5 py-1.5 text-[13px] transition-colors hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--ink-700)" }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
