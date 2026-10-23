// One-off: chuẩn hoá khung trang dashboard theo design tokens (Phase 26.5d).
import { readFileSync, writeFileSync } from "node:fs";

const files = process.argv.slice(2);
const rules = [
  [/<main className="p-6">/g, '<main className="px-8 pb-10 pt-6">'],
  [/className="mb-6 text-2xl font-semibold"/g, 'className="ui-h1 mb-6"'],
  [/className="mb-4 text-2xl font-semibold"/g, 'className="ui-h1 mb-4"'],
  [/className="text-2xl font-bold text-zinc-900"/g, 'className="ui-h1"'],
  [/className="text-2xl font-semibold"/g, 'className="ui-h1"'],
  [/className="mt-1 text-sm text-zinc-500"/g, 'className="ui-sub mt-1"'],
  [/className="mt-2 text-sm text-zinc-500"/g, 'className="ui-sub mt-2"'],
  [/className="mb-1 text-sm text-zinc-500"/g, 'className="ui-sub mb-1"'],
];

let touched = 0;
let changes = 0;
for (const file of files) {
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [re, to] of rules) {
    const hits = after.match(re)?.length ?? 0;
    if (hits) changes += hits;
    after = after.replace(re, to);
  }
  if (after !== before) {
    writeFileSync(file, after, "utf8");
    touched += 1;
    console.log("sửa", file);
  }
}
console.log(`\n${touched} file · ${changes} thay thế`);
