import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BizIndex() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) redirect("/login");

  const rows = await db
    .select({ slug: schema.bizs.slug, name: schema.bizs.name })
    .from(schema.members)
    .innerJoin(schema.bizs, eq(schema.members.bizId, schema.bizs.id))
    .where(eq(schema.members.userId, userId));

  if (rows.length === 1) redirect(`/biz/${rows[0].slug}/dashboard`);
  return (
    <main className="p-8">
      <h1 className="mb-4 text-xl font-semibold">Chọn Biz</h1>
      <ul className="space-y-2">
        {rows.map((b) => (
          <li key={b.slug}>
            <Link className="text-blue-600 underline" href={`/biz/${b.slug}/dashboard`}>{b.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
