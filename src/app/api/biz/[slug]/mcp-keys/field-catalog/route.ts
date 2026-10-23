import { ENTITIES, PRESET_PROVIDERS, SYSTEM_PRESETS } from "@/lib/field-catalog";

export const runtime = "nodejs";

/**
 * GET /api/biz/:slug/mcp-keys/field-catalog
 * Danh mục entity + field để cấu hình bộ chỉ số trả về cho MCP.
 */
export async function GET() {
  return Response.json({
    providers: PRESET_PROVIDERS,
    entities: ENTITIES,
    systemPresets: SYSTEM_PRESETS.map((p) => ({
      id: p.id,
      provider: p.provider,
      name: p.name,
      description: p.description,
      fieldCount: Object.values(p.config).reduce((n, arr) => n + arr.length, 0),
    })),
  });
}
