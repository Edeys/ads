import { PROVIDERS } from "@/lib/provider-catalog";

export const runtime = "nodejs";

/**
 * GET /api/biz/:slug/mcp-keys/scopes
 * Danh mục phạm vi quyền theo từng nền tảng (dùng cho form tạo MCP key).
 */
export async function GET() {
  const providers = PROVIDERS.filter((p) => p.group === "ads").map((p) => ({
    key: p.id,
    label: p.label,
    options: [
      { value: "all", label: "Toàn quyền" },
      { value: "read", label: "Chỉ đọc" },
      { value: "none", label: "Tắt" },
    ],
  }));

  return Response.json({
    providers,
    global: [
      { key: "write", label: "Cho phép ghi (qua Approval Gate)", type: "boolean" },
    ],
  });
}
