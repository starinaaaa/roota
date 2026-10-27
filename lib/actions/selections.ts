"use server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getPool } from "@/lib/db/pool";
import { selectionSchema } from "@/lib/favorites";
import { siteUrl } from "@/lib/seo";
import { uuid } from "@/lib/validation";
export async function createSelection(input: unknown) {
  const items = selectionSchema.parse(input),
    jar = await cookies();
  let owner = jar.get("selection_session")?.value;
  if (!uuid.safeParse(owner).success) {
    owner = crypto.randomUUID();
    jar.set("selection_session", owner!, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 86400 * 30,
      path: "/",
    });
  }
  const token = randomBytes(24).toString("hex");
  const result = await getPool().query(
    `with lock as (select pg_advisory_xact_lock(hashtextextended($1,7))) insert into public.saved_selections(token,owner_hash,items) select $2,md5($1),$3::jsonb from lock where (select count(*) from public.saved_selections where owner_hash=md5($1) and created_at>now()-interval '1 day')<20 returning token`,
    [owner, token, JSON.stringify(items)],
  );
  if (!result.rowCount) throw new Error("Слишком много подборок за день");
  return siteUrl(`/selection/${token}`);
}
