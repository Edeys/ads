// Chặn SSRF cho custom tools do AI gọi.
//
// URL của tool có thể chứa placeholder {{arg}} nên AI có thể chọn host. Nếu
// không chặn, một prompt xấu có thể trỏ tool về 127.0.0.1, mạng nội bộ hoặc
// metadata cloud. Mặc định chỉ cho phép host public; bật
// ADSYNC_ALLOW_PRIVATE_TOOLS=1 nếu thật sự cần gọi dịch vụ nội bộ.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function privateIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function privateIpv6(ip: string): boolean {
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // unique local
  if (low.startsWith("fe8") || low.startsWith("fe9") || low.startsWith("fea") || low.startsWith("feb")) return true; // link-local
  if (low.startsWith("::ffff:")) {
    const v4 = low.slice("::ffff:".length);
    if (isIP(v4) === 4) return privateIpv4(v4);
  }
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return privateIpv4(ip);
  if (v === 6) return privateIpv6(ip);
  return true;
}

export async function checkOutboundUrl(raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.ADSYNC_ALLOW_PRIVATE_TOOLS === "1") return { ok: true };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "URL không hợp lệ" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Chỉ cho phép http:// hoặc https://" };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "Tool không được gọi host nội bộ (localhost/.local/.internal)" };
  }

  if (isIP(host)) {
    return isPrivateAddress(host)
      ? { ok: false, error: "Tool không được gọi địa chỉ IP nội bộ" }
      : { ok: true };
  }

  // Phân giải DNS để chặn hostname trỏ về IP nội bộ (DNS rebinding cơ bản).
  try {
    const rows = await lookup(host, { all: true });
    if (rows.some((r) => isPrivateAddress(r.address))) {
      return { ok: false, error: "Hostname trỏ về địa chỉ IP nội bộ" };
    }
  } catch {
    return { ok: false, error: "Không phân giải được hostname của tool" };
  }
  return { ok: true };
}
