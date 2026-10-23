// Thay class Tailwind con mau cung bang token CSS.
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:\\ADS MCP APP\\src";
const MAP = {
  "bg-[#f8faff]": "bg-[var(--surface-3)]",
  "bg-[#e4eaf3]": "bg-[var(--surface-3)]",
  "bg-[#eaf2ff]": "bg-[var(--brand-soft)]",
  "bg-[#f1f4f9]": "bg-[var(--surface-3)]",
  "bg-[#f1f5fd]": "bg-[var(--surface-3)]",
  "bg-[#e9f8ef]": "bg-[var(--ok-bg)]",
  "hover:bg-[#f8faff]": "hover:bg-[var(--surface-3)]",
};

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx$/.test(e.name)) files.push(p);
  }
})(ROOT);

let n = 0;
for (const f of files) {
  const before = fs.readFileSync(f, "utf8");
  let after = before;
  for (const [k, v] of Object.entries(MAP)) after = after.split(k).join(v);
  if (after !== before) {
    fs.writeFileSync(f, after, "utf8");
    n++;
  }
}
console.log(`da sua ${n} file`);
