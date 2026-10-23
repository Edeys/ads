"use client";

import { useEffect, useState } from "react";

const KEY = "adsync.theme";

export type Theme = "light" | "dark";

/** Đọc theme đã lưu (mặc định sáng). Chỉ dùng phía client. */
export function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* localStorage bị chặn -> dùng mặc định */
  }
  return "light";
}

/** Ghi theme vào <html data-theme> + localStorage. */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* bỏ qua */
  }
}

/**
 * Hook trạng thái theme. Component con dùng để đổi nút sáng/tối.
 * Áp theme ngay khi mount để tránh nháy trắng khi mở lại app.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = readTheme();
    setTheme(current);
    applyTheme(current);
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }

  return { theme, toggle };
}
