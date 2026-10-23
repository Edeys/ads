// Tool SDK — chạy "custom tool" do người dùng khai báo bằng manifest (HTTP).
//
// Vì sao chỉ HTTP: app desktop chạy trên máy người dùng, thực thi code tuỳ ý từ
// manifest sẽ là lỗ hổng. Một tool = method + url + headers + body template +
// JSON Schema đầu vào. Ai cần logic phức tạp thì dựng endpoint của mình rồi khai báo.
import { db } from "@/db";
import { fetchT } from "./http";
import { customTools } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { checkOutboundUrl } from "./net-guard";

export type CustomTool = typeof customTools.$inferSelect;

export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{2,60}$/;
export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
/** Chỉ cho phép đọc biến môi trường dành riêng cho tool, không đọc secret hệ thống. */
export const TOOL_SECRET_REF_RE = /^ADSYNC_TOOL_SECRET_[A-Z0-9_]+$/;
const MAX_RESPONSE_BYTES = 256 * 1024;
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Chuẩn hoá tên tool: chữ thường, snake_case, chỉ [a-z0-9_]. */
export function normalizeToolName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Kiểm tra args theo JSON Schema tối giản (object/string/number/boolean/array). */
export function validateArgs(
  tool: Pick<CustomTool, "name" | "inputSchema">,
  raw: unknown,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const schema = (tool.inputSchema ?? { type: "object", properties: {} }) as {
    properties?: Record<string, { type?: string; enum?: string[] }>;
    required?: string[];
  };
  const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const props = schema.properties ?? {};

  for (const key of schema.required ?? []) {
    const v = args[key];
    if (v === undefined || v === null || v === "") {
      return { ok: false, error: `thiếu tham số bắt buộc "${key}"` };
    }
  }

  for (const [key, def] of Object.entries(props)) {
    const v = args[key];
    if (v === undefined || v === null) continue;
    const type = def.type ?? "string";
    const bad =
      (type === "string" && typeof v !== "string") ||
      (type === "number" && typeof v !== "number") ||
      (type === "integer" && !Number.isInteger(v)) ||
      (type === "boolean" && typeof v !== "boolean") ||
      (type === "array" && !Array.isArray(v)) ||
      (type === "object" && (typeof v !== "object" || Array.isArray(v)));
    if (bad) return { ok: false, error: `tham số "${key}" phải là ${type}` };
    if (def.enum && typeof v === "string" && !def.enum.includes(v)) {
      return { ok: false, error: `tham số "${key}" phải là một trong: ${def.enum.join(", ")}` };
    }
  }

  return { ok: true, args };
}

/** Thay {{key}} bằng giá trị arg (đã encode khi nằm trong URL). */
export function renderTemplate(template: string, args: Record<string, unknown>, forUrl = false): string {
  return template.replace(PLACEHOLDER, (_m, key: string) => {
    const v = args[key];
    if (v === undefined || v === null) return "";
    const text = typeof v === "string" ? v : JSON.stringify(v);
    return forUrl ? encodeURIComponent(text) : text;
  });
}

export type RunResult = {
  ok: boolean;
  status: number;
  ms: number;
  data: unknown;
  truncated?: boolean;
};

/** Gọi endpoint của tool. Không ném lỗi mạng ra ngoài — trả ok:false để UI/MCP đọc được. */
export async function runCustomTool(tool: CustomTool, args: Record<string, unknown>): Promise<RunResult> {
  const url = renderTemplate(tool.url, args, true);
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, status: 0, ms: 0, data: { error: "URL phải bắt đầu bằng http:// hoặc https://" } };
  }
  const guard = await checkOutboundUrl(url);
  if (!guard.ok) {
    return { ok: false, status: 0, ms: 0, data: { error: guard.error } };
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries((tool.headers ?? {}) as Record<string, string>)) {
    headers[k] = renderTemplate(String(v), args);
  }
  if (tool.secretRef) {
    if (!TOOL_SECRET_REF_RE.test(tool.secretRef)) {
      return {
        ok: false,
        status: 0,
        ms: 0,
        data: { error: "secretRef phải có dạng ADSYNC_TOOL_SECRET_<TÊN>, không được đọc secret hệ thống" },
      };
    }
    const token = process.env[tool.secretRef];
    if (token && !Object.keys(headers).some((h) => h.toLowerCase() === "authorization")) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const method = tool.method.toUpperCase();
  let body: string | undefined;
  if (method !== "GET" && method !== "DELETE" && tool.bodyTemplate) {
    body = renderTemplate(tool.bodyTemplate, args);
    if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
      headers["content-type"] = "application/json";
    }
  }

  const started = Date.now();
  try {
    const res = await fetchT(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(Math.min(Math.max(tool.timeoutMs ?? 10_000, 1_000), 60_000)),
      redirect: "error",
    });
    const text = await res.text();
    const truncated = text.length > MAX_RESPONSE_BYTES;
    const trimmed = truncated ? text.slice(0, MAX_RESPONSE_BYTES) : text;
    let data: unknown = trimmed;
    try {
      data = JSON.parse(trimmed);
    } catch {
      /* giữ nguyên text */
    }
    return { ok: res.ok, status: res.status, ms: Date.now() - started, data, truncated };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      data: { error: e?.name === "TimeoutError" ? "tool quá thời gian chờ" : String(e?.message ?? e) },
    };
  }
}

export async function listCustomTools(bizId: string, onlyEnabled = false) {
  const where = onlyEnabled
    ? and(eq(customTools.bizId, bizId), eq(customTools.enabled, true))
    : eq(customTools.bizId, bizId);
  return db.select().from(customTools).where(where);
}

export async function findCustomTool(bizId: string, nameOrId: string) {
  const rows = await db.select().from(customTools).where(eq(customTools.bizId, bizId));
  return rows.find((t) => t.id === nameOrId || t.name === nameOrId) ?? null;
}
