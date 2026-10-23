// Dev-only: chạy worker tick trong process Next.js.
// Lý do: PGlite chỉ cho 1 process mở ./.pgdata — không chạy được `npm run worker` song song.
// Chỉ hoạt động khi SELF_HOSTED=true và không có DATABASE_URL.
import { tick, healthTick, socialTick } from "@/worker/engine";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (process.env.SELF_HOSTED !== "true" || process.env.DATABASE_URL) {
    return Response.json({ error: "chỉ dùng cho dev PGlite" }, { status: 403 });
  }
  const session = await auth();
  if (!(session?.user as any)?.id) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const r: Record<string, unknown> = {};
  if (body.health) r.health = await healthTick();
  else if (body.social) r.social = await socialTick();
  else r.tick = await tick();
  return Response.json(r);
}
