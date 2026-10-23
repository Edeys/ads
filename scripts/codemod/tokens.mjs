// Codemod v2: moi hex hardcode -> mot token CSS duy nhat.
//
// Quy tac: hex nen nhat (vang, xanh, do nhat) -> token *-bg.
// Hex mau dam -> token *-ink (dung duoc ca cho color lan background).
// Nen vang/xanh nhat trong bang mau sang cung duoc, nen 1 token cho ca 2.
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:\\ADS MCP APP\\src";

// Cac file HTML thuan cua bridge dung mau rieng, khong dung he token.
const SKIP = [
  "src\\app\\api\\auth\\bridge\\route.ts",
  "src\\app\\api\\desktop\\auth-bridge\\launch\\route.ts",
];

// Hex nen nhat -> token nen.
const BG_TOKEN = {
  "#e7f7ee": "var(--ok-bg)",
  "#e9f8ef": "var(--ok-bg)",
  "#eef7f0": "var(--ok-bg)",
  "#eaf9f0": "var(--ok-bg)",
  "#fff6e3": "var(--warn-bg)",
  "#fff4e5": "var(--warn-bg)",
  "#fff5e6": "var(--warn-bg)",
  "#fff7e8": "var(--warn-bg)",
  "#fdeaea": "var(--danger-bg)",
  "#fdecec": "var(--danger-bg)",
  "#fdeeee": "var(--danger-bg)",
  "#ffeaea": "var(--danger-bg)",
  "#e9f1ff": "var(--brand-soft)",
  "#eaf2ff": "var(--brand-soft)",
  "#e8f0fe": "var(--brand-soft)",
  "#eef4fe": "var(--brand-soft)",
  "#eef4ff": "var(--brand-soft)",
  "#eef5ff": "var(--brand-soft)",
  "#f1f6ff": "var(--brand-soft)",
  "#f3eeff": "var(--brand-soft)",
  "#e4eaf3": "var(--surface-3)",
  "#e6edf7": "var(--surface-3)",
  "#f1f4f9": "var(--surface-3)",
  "#f1f5fd": "var(--surface-3)",
  "#f3f8ff": "var(--surface-3)",
  "#f4f7fd": "var(--surface-3)",
  "#f8faff": "var(--surface-3)",
  "#fbfcfe": "var(--surface-3)",
  "#fbfdff": "var(--surface-3)",
  "#d9e5f7": "var(--surface-3)",
  "#cfe0ff": "var(--brand-soft)",
  "#e8eefb": "var(--surface-3)",
};

// Hex mau dam -> token chu (dung duoc cho color va background).
const INK_TOKEN = {
  "#15803d": "var(--ok-ink)",
  "#17864a": "var(--ok-ink)",
  "#059669": "var(--ok-ink)",
  "#14532d": "var(--ok-ink)",
  "#86efac": "var(--ok-ink)",
  "#22a55d": "var(--ok-ink)",
  "#b26a00": "var(--warn-ink)",
  "#b25b00": "var(--warn-ink)",
  "#8a5a00": "var(--warn-ink)",
  "#d97706": "var(--warn-ink)",
  "#f0a020": "var(--warn-ink)",
  "#c62828": "var(--danger-ink)",
  "#b42318": "var(--danger-ink)",
  "#d92d20": "var(--danger-ink)",
  "#dc2626": "var(--danger-ink)",
  "#7f1d1d": "var(--danger-ink)",
  "#e04040": "var(--danger-ink)",
  "#fca5a5": "var(--danger-ink)",
  "#0b6bff": "var(--brand)",
  "#2563eb": "var(--brand)",
  "#1c4ed8": "var(--brand)",
  "#3b82f6": "var(--brand)",
  "#6b4ff2": "var(--brand)",
  "#0f172a": "var(--ink-900)",
  "#1e293b": "var(--ink-800)",
  "#334155": "var(--ink-700)",
  "#6b7891": "var(--ink-500)",
  "#94a3b8": "var(--ink-400)",
  "#cbd5e1": "var(--ink-300)",
  "#e2e8f0": "var(--ink-300)",
  "#111": "var(--ink-900)",
  "#111318": "var(--ink-900)",
  "#98a6bb": "var(--ink-400)",
  "#bfe8cf": "var(--ok-ink)",
  "#f5c2c2": "var(--danger-ink)",
  "#fff": "var(--card)",
  "#ffffff": "var(--card)",
};

const MAP = { ...BG_TOKEN, ...INK_TOKEN };

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name)) files.push(p);
  }
})(ROOT);

let changedFiles = 0;
let replaced = 0;

for (const f of files) {
  const rel = f.replace("D:\\ADS MCP APP\\", "");
  if (SKIP.includes(rel)) continue;
  const before = fs.readFileSync(f, "utf8");
  let after = before;

  for (const [hex, token] of Object.entries(MAP)) {
    const re = new RegExp(`"${hex}"`, "g");
    if (!re.test(after)) continue;
    after = after.replace(re, `"${token}"`);
    replaced++;
  }

  if (after !== before) {
    fs.writeFileSync(f, after, "utf8");
    changedFiles++;
  }
}
console.log(`da sua ${changedFiles} file, ${replaced} mau`);
