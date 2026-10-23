// AI calls qua connection của user (key của user — giống Done.vn).
// Dùng cho: CPA gray-zone, AI soát chính sách (post trigger).
import { db } from "@/db";
import { fetchT } from "./http";
import { connections, aiUsages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "./crypto";

export async function aiChat(opts: {
  connId: string; bizId: string; purpose: string;
  system?: string; user: string; model?: string;
}): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const [conn] = await db.select().from(connections).where(eq(connections.id, opts.connId)).limit(1);
  if (!conn) throw new Error("AI connection không tồn tại");
  const secret = decryptSecret((conn.secret as any).enc);
  const meta = conn.meta as Record<string, unknown>;

  let out: { text: string; tokensIn: number; tokensOut: number; model: string };

  switch (conn.provider) {
    case "gemini":
      out = await gemini(secret.api_key, opts.model ?? "gemini-2.0-flash", opts);
      break;
    case "anthropic":
      out = await anthropic(secret.api_key, opts.model ?? "claude-3-5-haiku-latest", opts);
      break;
    case "openai":
    case "deepseek":
    case "openai_compatible": {
      const base = conn.provider === "deepseek" ? "https://api.deepseek.com"
        : conn.provider === "openai" ? "https://api.openai.com/v1"
        : String(meta.base_url ?? "").replace(/\/$/, "");
      const model = opts.model ?? (conn.provider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini");
      out = await openaiCompat(base, secret.api_key, model, opts);
      break;
    }
    default:
      throw new Error(`Provider ${conn.provider} không phải AI`);
  }

  await db.insert(aiUsages).values({
    bizId: opts.bizId, connectionId: conn.id, model: out.model, purpose: opts.purpose,
    tokensIn: out.tokensIn, tokensOut: out.tokensOut,
  }).catch(() => {});
  return out;
}

async function openaiCompat(base: string, key: string, model: string, o: { system?: string; user: string }) {
  const res = await fetchT(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [...(o.system ? [{ role: "system", content: o.system }] : []), { role: "user", content: o.user }],
      temperature: 0.2,
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`AI: ${j.error.message ?? JSON.stringify(j.error)}`);
  return {
    text: j.choices?.[0]?.message?.content ?? "",
    tokensIn: j.usage?.prompt_tokens ?? 0,
    tokensOut: j.usage?.completion_tokens ?? 0,
    model,
  };
}

async function gemini(key: string, model: string, o: { system?: string; user: string }) {
  const res = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: o.system ? { parts: [{ text: o.system }] } : undefined,
      contents: [{ role: "user", parts: [{ text: o.user }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Gemini: ${j.error.message}`);
  return {
    text: j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "",
    tokensIn: j.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: j.usageMetadata?.candidatesTokenCount ?? 0,
    model,
  };
}

async function anthropic(key: string, model: string, o: { system?: string; user: string }) {
  const res = await fetchT("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 1024,
      system: o.system,
      messages: [{ role: "user", content: o.user }],
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Anthropic: ${j.error.message}`);
  return {
    text: j.content?.map((c: any) => c.text ?? "").join("") ?? "",
    tokensIn: j.usage?.input_tokens ?? 0,
    tokensOut: j.usage?.output_tokens ?? 0,
    model,
  };
}
