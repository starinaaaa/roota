import { reviewHasTable } from "@/lib/review-schema";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { uuid } from "@/lib/validation";
import CampaignEditor from "@/components/admin/CampaignEditor";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  if (!(await reviewHasTable("email_campaigns"))) notFound();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const [campaign, products, subscribers, results] = await Promise.all([
    getPool().query(
      "select *,tested_at::text from public.email_campaigns where id=$1",
      [id],
    ),
    getPool().query(
      "select id,name from public.products where publication_status='published' order by name",
    ),
    getPool().query(
      "select distinct on(lower(email)) id,email from public.email_subscriptions s where purpose='news' and revoked_at is null and (confirmed_at is not null or direct_consent_at is not null) and not exists(select 1 from public.email_blocks b where b.email=s.email) order by lower(email),created_at desc",
    ),
    getPool().query(
      "select state,count(*)::int count from public.email_messages where campaign_id=$1 and not coalesce((payload->>'test')::boolean,false) group by state",
      [id],
    ),
  ]);
  const c = campaign.rows[0];
  if (!c) notFound();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-section">{c.name}</h1>
      <p>
        Статус: {c.state} ·{" "}
        {c.tested_at
          ? "Тест принят провайдером"
          : "Тест этой версии ещё не отправлен"}
      </p>
      {c.scheduled_at && (
        <p>
          Отправка:{" "}
          {c.scheduled_at.toLocaleString("ru-RU", {
            timeZone: "Europe/Moscow",
          })}{" "}
          МСК
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        {results.rows.map((r) => (
          <p key={r.state}>
            {r.state}: {r.count}
          </p>
        ))}
      </div>
      <CampaignEditor
        campaign={c}
        products={products.rows}
        subscribers={subscribers.rows}
      />
    </div>
  );
}
