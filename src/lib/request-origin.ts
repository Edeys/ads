// Các endpoint chỉ dành cho app desktop (bootstrap, auth bridge) phải kiểm tra
// request đến từ loopback. Nếu người dùng mở server qua tunnel, các endpoint này
// không được phép tạo phiên/seed dữ liệu từ xa.
export function isLoopbackRequest(req: Request): boolean {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const hostHeader = req.headers.get("host");
  const rawHost = (forwardedHost ?? hostHeader ?? new URL(req.url).hostname)
    .split(",")[0]
    .trim()
    .replace(/:\d+$/, "")
    .toLowerCase();
  const host = rawHost.replace(/^\[|\]$/g, "");
  if (!(host === "127.0.0.1" || host === "localhost" || host === "::1")) return false;

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor && forwardedFor !== "127.0.0.1" && forwardedFor !== "::1") return false;
  return true;
}

export function loopbackForbidden(): Response {
  return Response.json({ error: "forbidden" }, { status: 403 });
}
