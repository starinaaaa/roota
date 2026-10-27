import { reviewQuery } from "@/lib/review-schema";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import CampaignEditor from "@/components/admin/CampaignEditor";
export default async function Page() {
  await requireAdmin();
  const [campaigns, products, subscribers] = await Promise.all([
    reviewQuery("email_campaigns",
      "select * from public.email_campaigns order by created_at desc limit 100",
    ),
    getPool().query(
      "select id,name from public.products where publication_status='published' order by name",
    ),
    getPool().query(
      "select distinct on (lower(email)) id,email from public.email_subscriptions s where purpose='news' and revoked_at is null and (confirmed_at is not null or direct_consent_at is not null) and not exists(select 1 from public.email_blocks b where b.email=s.email) order by lower(email),created_at desc",
    ),
  ]);
  return (
    <div className="space-y-8">
      <h1 className="font-display text-section">Рассылки о коллекциях</h1>
      <div className="space-y-3">
        {campaigns.rows.map((c) => (
          <Link
            key={c.id}
            href={`/admin/campaigns/${c.id}`}
            className="block border rounded p-4"
          >
            {c.name} ·{" "}
            {
              {
                draft: "Черновик",
                scheduled: "По расписанию",
                queued: "В почтовой очереди",
                cancelled: "Остановлена",
              }[c.state as string]
            }
          </Link>
        ))}
      </div>
      <h2 className="text-xl">Новая кампания</h2>
      <CampaignEditor products={products.rows} subscribers={subscribers.rows} />
    </div>
  );
}
