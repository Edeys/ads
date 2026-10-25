// Bắt đầu OAuth cho mạng social mới (x_twitter|linkedin|tiktok|threads|pinterest).
// GET /api/connect/social/[network]/start?slug=... → redirect sang mạng đó.
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { pkcePair, signSocialState, socialClient, SOCIAL_NETWORKS } from "@/lib/social-oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ network: string }> }) {
  const { network } = await params;
  const def = SOCIAL_NETWORKS[network];
  if (!def) return Response.json({ error: "network không hỗ trợ" }, { status: 404 });

  const client = socialClient(def);
  if (!client) {
    return Response.json(
      { error: `Chưa cấu hình ${def.clientIdEnv[0]} / ${def.clientSecretEnv[0]} — xem docs/ADAPTERS.md` },
      { status: 503 },
    );
  }

  const session = await auth();
  if (!(session?.user as any)?.id && process.env.SELF_HOSTED !== "true") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const redirectUri = new URL(`/api/connect/social/${network}/callback`, new URL(req.url).origin).toString();

  const qs = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: def.scopes.join(def.key === "linkedin" ? " " : ","),
    state: signSocialState({ slug, network, ts: Date.now() }),
  });
  if (def.pkce) {
    const { verifier, challenge } = pkcePair();
    // Verifier đi trong state (tự ký) để callback dùng lại — state không tiết lộ gì nhạy cảm.
    qs.set("state", signSocialState({ slug, network, ts: Date.now(), verifier }));
    qs.set("code_challenge", challenge);
    qs.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(def.extraAuthParams ?? {})) qs.set(k, v);

  return Response.redirect(`${def.authUrl}?${qs}`);
}
