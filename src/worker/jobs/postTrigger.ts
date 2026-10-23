import type { schema } from "../../db";
import { fetchT } from "../../lib/http";
import { db } from "../../db";
import { configs, adTemplates } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { metaToken } from "../../lib/meta-ads";
import { createCampaignFromPost } from "../../lib/meta-campaign";
import { telegramSend } from "../../lib/notify";
import { aiChat } from "../../lib/ai";

const GRAPH = "https://graph.facebook.com/v21.0";

// Xử lý 1 bài đã khớp keyword: AI soát chính sách → tạo campaign PAUSED → Telegram.
async function processMatchedPost(cfg: typeof schema.configs.$inferSelect, token: string, tpl: any, post: { id: string; message?: string }) {
  const p = cfg.params as any;
  if (p.aiConnId) {
    try {
      const ai = await aiChat({
        connId: p.aiConnId, bizId: cfg.bizId, purpose: "policy_check",
        system: `Bạn là bộ lọc chính sách quảng cáo Meta. Trả lời ĐÚNG JSON {"pass":true|false,"reason":"..."}. Chặn: vi phạm chính sách ads (khoe thu nhập, before/after, nhạy cảm, claim y khoa).`,
        user: `Bài viết sẽ chạy ads:\n---\n${post.message ?? "(không text)"}\n---`,
      });
      const m = ai.text.match(/\{[^}]*\}/);
      if (m && JSON.parse(m[0]).pass === false) {
        if (p.notifyConnId) await telegramSend(p.notifyConnId, `[PostTrigger] 🚫 AI chặn bài ${post.id}\nLý do: ${JSON.parse(m[0]).reason ?? "vi phạm"}`).catch(() => {});
        return { aiBlocked: true, created: false };
      }
    } catch (e: any) {
      console.error("[post_trigger] AI check failed", e.message);
    }
  }
  try {
    const r = await createCampaignFromPost({
      token, adAccountId: p.adAccountId, postId: post.id, pageId: p.pageId, template: tpl,
      campaignName: `[trigger] ${tpl.name} — ${post.id.split("_")[1] ?? post.id}`,
    });
    if (p.notifyConnId) {
      await telegramSend(p.notifyConnId,
        `[PostTrigger] ✅ bài "${truncate(post.message ?? post.id, 60)}" khớp keyword\n→ campaign ${(r as any).campaignId} (PAUSED — chờ duyệt)`).catch(() => {});
    }
    return { aiBlocked: false, created: true, campaignId: (r as any).campaignId };
  } catch (e: any) {
    if (p.notifyConnId) await telegramSend(p.notifyConnId, `[PostTrigger] ❌ tạo campaign thất bại cho bài ${post.id}: ${e.message}`).catch(() => {});
    return { aiBlocked: false, created: false, error: e.message };
  }
}

// Webhook path: page vừa đăng bài mới — chạy trực tiếp qua mọi post_trigger config
// đang bật của page này (không cần chờ chu kỳ poll).
export async function runPostTriggersForPost(bizId: string, pageId: string, post: { id: string; message?: string }) {
  const rows = await db.select().from(configs).where(and(eq(configs.type, "post_trigger"), eq(configs.status, "on")));
  const hits = rows.filter((c) => c.bizId === bizId && (c.params as any)?.pageId === pageId && c.credentialId);
  const text = String(post.message ?? "").toLowerCase();
  let matched = 0, created = 0, aiBlocked = 0;
  for (const cfg of hits) {
    const p = cfg.params as any;
    const kw = (p.keywords ?? []) as string[];
    const ht = (p.hashtags ?? []) as string[];
    const hit = kw.some((k) => text.includes(k.toLowerCase())) || ht.some((h) => text.includes(h.replace(/^#/, "").toLowerCase()) || text.includes(`#${h.replace(/^#/, "").toLowerCase()}`));
    if (!hit || !cfg.credentialId) continue;
    matched++;
    const [tpl] = await db.select().from(adTemplates).where(eq(adTemplates.id, p.templateId)).limit(1);
    if (!tpl) continue;
    const token = await metaToken(cfg.credentialId);
    const r = await processMatchedPost(cfg, token, tpl, post);
    if (r.aiBlocked) aiBlocked++;
    if (r.created) created++;
    // đánh dấu đã thấy để chu kỳ poll không xử lý lại
    p._seenIds = [...new Set([...(p._seenIds ?? []), post.id])].slice(-500);
    await db.update(configs).set({ params: p }).where(eq(configs.id, cfg.id));
  }
  return { configs: hits.length, matched, created, aiBlocked };
}

// Tự động chạy ads: poll page feed -> khớp keyword/hashtag -> AI soát chính sách
// -> tạo campaign PAUSED chờ duyệt -> Telegram.
// params: { adAccountId, pageId, templateId, keywords[], hashtags[], notifyConnId, aiConnId?, _seenIds[] }
export async function runPostTrigger(cfg: typeof schema.configs.$inferSelect) {
  const p = cfg.params as any;
  if (!cfg.credentialId || !p.pageId || !p.templateId) throw new Error("Config thiếu credential/pageId/templateId");
  const token = await metaToken(cfg.credentialId);
  const [tpl] = await db.select().from(adTemplates).where(eq(adTemplates.id, p.templateId)).limit(1);
  if (!tpl) throw new Error("Template không tồn tại");

  // 1. Poll feed — 20 bài gần nhất, dedup qua _seenIds
  const feed = await fetchT(
    `${GRAPH}/${p.pageId}/posts?fields=id,message,created_time&limit=20&access_token=${token}`
  ).then((r) => r.json());
  if (feed.error) throw new Error(`Meta: ${feed.error.message}`);
  const seen = new Set<string>(p._seenIds ?? []);
  const fresh = (feed.data ?? []).filter((post: any) => !seen.has(post.id));

  let matched = 0, created = 0, aiBlocked = 0;
  for (const post of fresh) {
    seen.add(post.id);
    const text = String(post.message ?? "").toLowerCase();
    const kw = (p.keywords ?? []) as string[];
    const ht = (p.hashtags ?? []) as string[];
    const hit = kw.some((k) => text.includes(k.toLowerCase())) || ht.some((h) => text.includes(h.replace(/^#/, "").toLowerCase()) || text.includes(`#${h.replace(/^#/, "").toLowerCase()}`));
    if (!hit) continue;
    matched++;

    const r = await processMatchedPost(cfg, token, tpl, post);
    if (r.aiBlocked) aiBlocked++;
    if (r.created) created++;
  }

  // Lưu lại seen (giữ 500 id gần nhất)
  p._seenIds = [...seen].slice(-500);
  await db.update(configs).set({ params: p }).where(eq(configs.id, cfg.id));

  return { scanned: fresh.length, matched, created, aiBlocked };
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
