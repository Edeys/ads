// Rate limit trong bộ nhớ cho các endpoint nhạy cảm (DCR, auth bridge, token).
// Đủ để chặn spam/brute-force cơ bản khi app được mở qua tunnel; reset khi restart.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, max: number, windowMs: number, weight = 1): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  // Weight = số "hit" lần gọi này chiếm (VD: batch JSON-RPC N message = N hit).
  // Bucket mới tính từ 0 TRƯỚC khi check — batch 300 vào limit 240 phải bị
  // chặn ngay từ request đầu, không được "cho qua rồi mới đếm".
  const w = Math.max(1, Math.floor(weight));
  const fresh = !buckets.get(key) || buckets.get(key)!.resetAt <= now;
  const count = fresh ? 0 : buckets.get(key)!.count;
  if (count + w > max) {
    const resetAt = fresh ? now + windowMs : buckets.get(key)!.resetAt;
    return { ok: false, retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
  }
  buckets.set(key, { count: count + w, resetAt: fresh ? now + windowMs : buckets.get(key)!.resetAt });
  return { ok: true };
}

export function clientKey(req: Request, prefix: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  return `${prefix}:${ip}`;
}

export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    { error: "too_many_requests", retry_after: retryAfter },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}

// Dọn bucket hết hạn định kỳ để Map không phình mãi.
if (typeof setInterval === "function") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }, 10 * 60_000);
  if (typeof timer.unref === "function") timer.unref();
}
