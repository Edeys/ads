import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
if (!secret && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error("Thiếu NEXTAUTH_SECRET — không thể mã hoá credential an toàn.");
}
const key = createHash("sha256").update(secret || "dev-secret").digest();

export function encryptSecret(obj: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): Record<string, string> {
  const [iv, tag, data] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export function newMcpKey() {
  return `mcp_${randomBytes(24).toString("base64url")}`;
}
