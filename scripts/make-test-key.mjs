// Tạo MCP key test trực tiếp trong PGlite (chỉ dùng khi server ĐÃ TẮT —
// PGlite cho một process mở dữ liệu tại một thời điểm).
//
//   node scripts/make-test-key.mjs
//
// In ra key dạng mk_... để chạy:
//   MCP_KEY=mk_... node scripts/verify_mcp.mjs
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const dir = process.env.ADSYNC_DATA_DIR?.trim() || "./.pgdata";
const db = new PGlite(dir);

const raw = `mk_test_${randomUUID().replace(/-/g, "")}`;
const hash = createHash("sha256").update(raw).digest("hex");
const prefix = raw.slice(0, 11);

const biz = await db.query("SELECT id, slug FROM bizs ORDER BY created_at ASC LIMIT 1");
if (!biz.rows.length) {
  console.error("Chưa có biz nào — chạy seed trước (npm run seed hoặc /api/dev/bootstrap).");
  await db.close();
  process.exit(1);
}
const { id: bizId, slug } = biz.rows[0];

const scopes = {
  meta_ads: "read",
  google_ads: "read",
  tiktok_ads: "read",
  search_console: "read",
  ga4: "read",
  clarity: "read",
  pancake: "none",
  write: "false",
};

await db.query(
  `INSERT INTO mcp_keys (id, biz_id, name, key_hash, key_prefix, scopes, field_presets, field_config, skill_ids, status)
   VALUES ($1, $2, $3, $4, $5, $6::jsonb, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, 'active')`,
  [randomUUID(), bizId, "verify-mcp (tạm)", hash, prefix, JSON.stringify(scopes)],
);

await db.close();
console.log(`\nBiz: ${slug}\nMCP_KEY=${raw}\n`);
console.log(`Kiểm tra:  MCP_KEY=${raw} node scripts/verify_mcp.mjs\n`);
