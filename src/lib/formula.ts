// Công thức trường tuỳ chỉnh cho bảng Chỉ số quảng cáo.
// Chỉ cho phép: {tên_chỉ_số}, số (dấu chấm), + - * / ( ), dấu âm.
// Không dùng eval: tokenize + recursive-descent, chia 0 hoặc thiếu dữ liệu ⇒ null ("-").
export type FormulaFormat = "number" | "currency" | "percent" | "decimal";

export const FORMULA_FORMATS: { key: FormulaFormat; label: string }[] = [
  { key: "number", label: "Số" },
  { key: "currency", label: "Tiền tệ" },
  { key: "percent", label: "Phần trăm" },
  { key: "decimal", label: "Số thập phân" },
];

type Token =
  | { type: "num"; value: number }
  | { type: "ref"; name: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "paren"; value: "(" | ")" };

const MAX_LENGTH = 300;

export function validateFormula(expr: string, allowed: string[]): { ok: true } | { ok: false; error: string } {
  const text = (expr ?? "").trim();
  if (!text) return { ok: false, error: "Công thức đang trống" };
  if (text.length > MAX_LENGTH) return { ok: false, error: `Công thức tối đa ${MAX_LENGTH} ký tự` };

  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === "{") {
      const end = text.indexOf("}", i + 1);
      if (end < 0) return { ok: false, error: "Thiếu dấu } cho tên chỉ số" };
      const name = text.slice(i + 1, end).trim();
      if (!name) return { ok: false, error: "Tên chỉ số trong ngoặc nhọn đang trống" };
      if (!allowed.includes(name)) return { ok: false, error: `Không có chỉ số "${name}"` };
      tokens.push({ type: "ref", name });
      i = end + 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(text.slice(i));
      if (!m) return { ok: false, error: `Số không hợp lệ gần "${text.slice(i, i + 6)}"` };
      tokens.push({ type: "num", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") { tokens.push({ type: "op", value: ch }); i += 1; continue; }
    if (ch === "(" || ch === ")") { tokens.push({ type: "paren", value: ch }); i += 1; continue; }
    return { ok: false, error: `Ký tự không hợp lệ: "${ch}"` };
  }

  if (!tokens.length) return { ok: false, error: "Công thức đang trống" };

  // Kiểm tra cú pháp bằng cách chạy thử với giá trị 1.
  const probe: Record<string, number> = Object.fromEntries(allowed.map((k) => [k, 1]));
  const result = evaluate(tokens, probe);
  if (!result.ok) return { ok: false, error: result.error };
  if (!tokens.some((t) => t.type === "ref")) return { ok: false, error: "Công thức phải dùng ít nhất một chỉ số" };
  return { ok: true };
}

export function evalFormula(expr: string, values: Record<string, number | null | undefined>): number | null {
  const text = (expr ?? "").trim();
  if (!text || text.length > MAX_LENGTH) return null;
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === "{") {
      const end = text.indexOf("}", i + 1);
      if (end < 0) return null;
      tokens.push({ type: "ref", name: text.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(text.slice(i));
      if (!m) return null;
      tokens.push({ type: "num", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") { tokens.push({ type: "op", value: ch }); i += 1; continue; }
    if (ch === "(" || ch === ")") { tokens.push({ type: "paren", value: ch }); i += 1; continue; }
    return null;
  }
  const nums: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) if (typeof v === "number" && Number.isFinite(v)) nums[k] = v;
  const res = evaluate(tokens, nums);
  return res.ok ? res.value : null;
}

function evaluate(tokens: Token[], values: Record<string, number>):
  | { ok: true; value: number }
  | { ok: false; error: string } {
  let pos = 0;

  function peek(): Token | undefined { return tokens[pos]; }
  function next(): Token | undefined { return tokens[pos++]; }

  function parseExpr(): { ok: true; value: number | null } | { ok: false; error: string } {
    let left = parseTerm();
    if (!left.ok) return left;
    while (true) {
      const t = peek();
      if (!t || t.type !== "op" || (t.value !== "+" && t.value !== "-")) break;
      next();
      const right = parseTerm();
      if (!right.ok) return right;
      if (left.value === null || right.value === null) { left = { ok: true, value: null }; continue; }
      left = { ok: true, value: t.value === "+" ? left.value + right.value : left.value - right.value };
    }
    return left;
  }

  function parseTerm(): { ok: true; value: number | null } | { ok: false; error: string } {
    let left = parseUnary();
    if (!left.ok) return left;
    while (true) {
      const t = peek();
      if (!t || t.type !== "op" || (t.value !== "*" && t.value !== "/")) break;
      next();
      const right = parseUnary();
      if (!right.ok) return right;
      if (left.value === null || right.value === null) { left = { ok: true, value: null }; continue; }
      if (t.value === "/") {
        if (right.value === 0) return { ok: false, error: "Chia cho 0" };
        left = { ok: true, value: left.value / right.value };
      } else {
        left = { ok: true, value: left.value * right.value };
      }
    }
    return left;
  }

  function parseUnary(): { ok: true; value: number | null } | { ok: false; error: string } {
    const t = peek();
    if (t && t.type === "op" && t.value === "-") {
      next();
      const v = parseUnary();
      if (!v.ok) return v;
      return { ok: true, value: v.value === null ? null : -v.value };
    }
    return parsePrimary();
  }

  function parsePrimary(): { ok: true; value: number | null } | { ok: false; error: string } {
    const t = next();
    if (!t) return { ok: false, error: "Công thức bị thiếu" };
    if (t.type === "num") return { ok: true, value: t.value };
    if (t.type === "ref") {
      const v = values[t.name];
      return { ok: true, value: typeof v === "number" && Number.isFinite(v) ? v : null };
    }
    if (t.type === "paren" && t.value === "(") {
      const inner = parseExpr();
      if (!inner.ok) return inner;
      const close = next();
      if (!close || close.type !== "paren" || close.value !== ")") return { ok: false, error: "Thiếu dấu )" };
      return inner;
    }
    return { ok: false, error: "Công thức không hợp lệ" };
  }

  const result = parseExpr();
  if (!result.ok) return result;
  if (pos !== tokens.length) return { ok: false, error: "Công thức thừa ký tự" };
  if (result.value === null) return { ok: false, error: "Thiếu dữ liệu" };
  if (!Number.isFinite(result.value)) return { ok: false, error: "Kết quả không hợp lệ" };
  return { ok: true, value: result.value };
}

export function formatValue(value: number | null, format: FormulaFormat, decimals = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const d = Math.max(0, Math.min(4, decimals));
  if (format === "percent") return `${(value).toLocaleString("vi-VN", { maximumFractionDigits: d })}%`;
  if (format === "currency") return `${Math.round(value).toLocaleString("vi-VN")}₫`;
  if (format === "decimal") return value.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
  return value.toLocaleString("vi-VN", { maximumFractionDigits: d });
}

export type CustomField = {
  key: string;
  name: string;
  formula: string;
  format: FormulaFormat;
  decimals: number;
};
