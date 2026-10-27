"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { transaction, getPool } from "@/lib/db/pool";
import { campaignSchema } from "@/lib/campaigns";
import { renderEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/server";
import { siteUrl } from "@/lib/seo";
export async function saveCampaign(form: FormData) {
  const admin = await requireAdmin();
  try {
    const mode = String(form.get("action") ?? "save");
    if (!["save", "test", "schedule", "cancel"].includes(mode))
      throw new Error("Неизвестное действие");
    const d = campaignSchema.parse({
      id: form.get("id") || undefined,
      name: form.get("name"),
      subject: form.get("subject"),
      body: form.get("body"),
      product_ids: form.getAll("product_ids"),
      recipient_ids: form.getAll("recipient_ids"),
    });
    const id = d.id ?? randomUUID();
    const campaign = await transaction(async (db) => {
      const {
        rows: [old],
      } = await db.query(
        "select * from public.email_campaigns where id=$1 for update",
        [id],
      );
      if (old && old.state !== "draft" && mode !== "cancel")
        throw new Error("Кампания уже запланирована или поставлена в очередь");
      if (mode === "cancel") {
        if (!old) throw new Error("Кампания не найдена");
        await db.query(
          "update public.email_campaigns set state='cancelled',updated_at=now() where id=$1",
          [id],
        );
        await db.query(
          "update public.email_messages set state='cancelled',last_error='Кампания остановлена' where campaign_id=$1 and state='pending'",
          [id],
        );
        return old;
      }
      const changed =
        !old ||
        JSON.stringify([
          old.name,
          old.subject,
          old.body,
          old.product_ids,
          old.recipient_ids,
        ]) !==
          JSON.stringify([
            d.name,
            d.subject,
            d.body,
            d.product_ids,
            d.recipient_ids,
          ]);
      const {
        rows: [saved],
      } = await db.query(
        `insert into public.email_campaigns(id,name,subject,body,product_ids,recipient_ids) values($1,$2,$3,$4,$5,$6)
    on conflict(id) do update set name=excluded.name,subject=excluded.subject,body=excluded.body,product_ids=excluded.product_ids,recipient_ids=excluded.recipient_ids,tested_at=case when $7 then null else email_campaigns.tested_at end,updated_at=now() returning *,updated_at::text as content_revision`,
        [
          id,
          d.name,
          d.subject,
          d.body,
          d.product_ids,
          d.recipient_ids,
          changed,
        ],
      );
      if (mode === "schedule") {
        const date = String(form.get("scheduled_at") ?? "");
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date))
          throw new Error("Укажите дату и время МСК");
        const scheduled = new Date(`${date}:00+03:00`);
        if (!Number.isFinite(+scheduled) || +scheduled < Date.now() + 60000)
          throw new Error("Выберите время хотя бы через минуту");
        if (!saved.tested_at)
          throw new Error("Сначала сохраните и отправьте тест этой версии");
        if (!d.recipient_ids.length) throw new Error("Выберите подписчиков");
        const {
          rows: [eligible],
        } = await db.query(
          "select count(*)::int n from public.email_subscriptions s where s.id=any($1) and purpose='news' and revoked_at is null and (confirmed_at is not null or direct_consent_at is not null) and not exists(select 1 from public.email_blocks b where b.email=s.email)",
          [d.recipient_ids],
        );
        if (!eligible.n)
          throw new Error("Нет подписчиков с действующим согласием");
        await db.query(
          "update public.email_campaigns set state='scheduled',scheduled_at=$2 where id=$1",
          [id, scheduled],
        );
      }
      return saved;
    });
    if (mode === "test") {
      const { rows: products } = await getPool().query(
        "select name,slug,price from public.products where id=any($1) and publication_status='published'",
        [d.product_ids],
      );
      const testId = randomUUID();
      const body = `${d.body}\n\n${products.map((p) => `${p.name} — ${p.price} ₽\n${siteUrl(`/product/${p.slug}`)}`).join("\n\n")}`;
      await getPool().query(
        "insert into public.email_messages(id,event_key,kind,recipient,state,attempts,claim,claimed_at,campaign_id,payload) values($1,$2,'collection',$3,'sending',1,$1,now(),$4,'{\"test\":true}')",
        [testId, `campaign-test:${testId}`, admin.email, id],
      );
      let result;
      try {
        result = await sendEmail(
          {
            to: admin.email,
            idempotenceKey: testId,
            metadata: { message_id: testId },
            ...renderEmail(
              { subject: `[Тест] ${d.subject}`, body },
              {},
              siteUrl("/catalog"),
              "Посмотреть изделия",
              siteUrl("/catalog"),
            ),
          },
          "collection",
        );
      } catch {
        await getPool().query(
          "update public.email_messages set state='unknown',last_error='Проверьте тест у провайдера перед повтором' where id=$1",
          [testId],
        );
        throw new Error("Результат теста неизвестен; проверьте журнал");
      }
      const state =
        result.state === "rejected" ||
        result.state === "disabled" ||
        result.state === "unconfigured"
          ? "failed"
          : result.state;
      await getPool().query(
        "update public.email_messages set state=$2,provider_job_id=$3,last_error=$4 where id=$1",
        [
          testId,
          state,
          result.state === "accepted" ? result.jobId : null,
          result.state === "accepted" ? null : result.state,
        ],
      );
      if (result.state !== "accepted")
        throw new Error(`Тест не принят провайдером: ${result.state}`);
      await getPool().query(
        "update public.email_campaigns set tested_at=now() where id=$1 and updated_at=$2",
        [id, campaign.content_revision],
      );
    }
    revalidatePath("/admin/campaigns");
    revalidatePath(`/admin/campaigns/${id}`);
    return {
      id,
      message:
        mode === "test"
          ? `Тест отправлен на ${admin.email}`
          : mode === "schedule"
            ? "Рассылка запланирована"
            : mode === "cancel"
              ? "Ожидающие письма остановлены. Уже отправленные отменить нельзя."
              : "Черновик сохранён",
    };
  } catch (e) {
    return {
      error:
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "Проверьте название, тему, текст и подборку изделий",
    };
  }
}
