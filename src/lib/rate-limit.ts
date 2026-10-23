// Rate limit trong bộ nhớ cho các endpoint nhạy cảm (DCR, auth bridge, token).
// Đủ để chặn spam/brute-force cơ bản khi app được mở qua tunnel; reset khi restart.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, max: number, windowMs: number): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (b.count >= max) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
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
