// Growth preview — kéo số liệu 28 ngày qua từ mọi nguồn đã kết nối của biz.
import { getMembership } from "@/lib/guard";
import { growthOverview } from "@/lib/growth";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json(await growthOverview(m.biz.id));
}
