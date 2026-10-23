// Codemod: chay hardcode mau nen trang -> token CSS, de che do toi hoat dong.
// Chay lai duoc nhieu lan, khong sua logic.
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:\\ADS MCP APP\\src";

// nen -> token
const SURFACE = {
  "#ffffff": "var(--card)",
  "#fff": "var(--card)",
  "#f8fafd": "var(--surface-2)",
  "#f3f7fd": "var(--surface-3)",
  "#f1f5fd": "var(--surface-3)",
  "#f1f4f9": "var(--surface-3)",
  "#eef4fe": "var(--brand-soft)",
  "#eef4ff": "var(--brand-soft)",
  "#e9f1ff": "var(--brand-soft)",
  "#f6f9ff": "var(--surface-3)",
  "#f8fbff": "var(--row-hover)",
  "#eef2f8": "var(--surface-3)",
  "#f1f4f9 ": "var(--surface-3) ",
};

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name)) files.push(p);
  }
})(ROOT);

let changed = 0;
let touched = 0;
for (const f of files) {
  const before = fs.readFileSync(f, "utf8");
  let after = before;

  // 1) inline style: background: "#fff" / backgroundColor: "#fff"
  for (const [hex, token] of Object.entries(SURFACE)) {
    const re = new RegExp(`(background|backgroundColor)\\s*:\\s*"${hex.replace("#", "#")}"`, "g");
    after = after.replace(re, (_m, prop) => `${prop}: "${token}"`);
  }

  // 2) Tailwind class bg-white -> bg-[var(--card)]
  after = after.replace(/\bbg-white\b/g, "bg-[var(--card)]");
  // hover:bg-white/70 -> hover:bg-[var(--surface-3)]
  after = after.replace(/\bhover:bg-white\/70\b/g, "hover:bg-[var(--surface-3)]");
  // hover:bg-[#f6f9ff] -> hover:bg-[var(--surface-3)]
  after = after.replace(/\bhover:bg-\[#f6f9ff\]/g, "hover:bg-[var(--surface-3)]");
  // hover:bg-[#f1f5fd] -> hover:bg-[var(--surface-3)]
  after = after.replace(/\bhover:bg-\[#f1f5fd\]/g, "hover:bg-[var(--surface-3)]");
  // hover:bg-[#fff5f5] -> hover:bg-[var(--danger-bg)]
  after = after.replace(/\bhover:bg-\[#fff5f5\]/g, "hover:bg-[var(--danger-bg)]");
  // bg-[#f8fafd] -> bg-[var(--surface-2)]
  after = after.replace(/\bbg-\[#f8fafd\]/g, "bg-[var(--surface-2)]");
  // bg-[#f3f7fd] -> bg-[var(--surface-3)]
  after = after.replace(/\bbg-\[#f3f7fd\]/g, "bg-[var(--surface-3)]");
  // bg-[#eef4fe] -> bg-[var(--brand-soft)]
  after = after.replace(/\bbg-\[#eef4fe\]/g, "bg-[var(--brand-soft)]");

  if (after !== before) {
    fs.writeFileSync(f, after, "utf8");
    changed++;
    touched += before.length - after.length;
  }
}
console.log(`da sua ${changed} file (${touched} byte net)`);
