import { db, schema } from "@/db";

export async function logActivity(opts: {
  bizId: string;
  actorId?: string | null;
  action: string;
  status?: "success" | "error" | "info";
  objectType?: string;
  objectId?: string;
  detail?: Record<string, unknown>;
}) {
  await db.insert(schema.activityLogs).values({
    bizId: opts.bizId,
    actorId: opts.actorId ?? null,
    action: opts.action,
    status: opts.status ?? "success",
    objectType: opts.objectType,
    objectId: opts.objectId,
    detail: opts.detail ?? {},
  }).catch((e) => console.error("[audit] failed", e));
}
