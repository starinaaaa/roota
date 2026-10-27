"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCampaign } from "@/lib/actions/campaigns";
type Campaign = {
  id: string;
  name: string;
  subject: string;
  body: string;
  product_ids: string[];
  recipient_ids: string[];
  state: string;
  tested_at: string | null;
};
export default function CampaignEditor({
  campaign,
  products,
  subscribers,
}: {
  campaign?: Campaign;
  products: { id: string; name: string }[];
  subscribers: { id: string; email: string }[];
}) {
  const [status, setStatus] = useState(""),
    [pending, start] = useTransition(),
    router = useRouter();
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const button = (e.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement;
        form.set("action", button?.value ?? "save");
        start(async () => {
          const result = await saveCampaign(form);
          setStatus(result.error ?? result.message ?? "");
          if (result.id && !campaign)
            router.push(`/admin/campaigns/${result.id}`);
          else router.refresh();
        });
      }}
    >
      {campaign && <input type="hidden" name="id" value={campaign.id} />}
      <fieldset
        disabled={pending || Boolean(campaign && campaign.state !== "draft")}
        className="space-y-5"
      >
        <label className="block">
          Название кампании
          <input
            required
            name="name"
            maxLength={150}
            defaultValue={campaign?.name}
            className="admin-input"
          />
        </label>
        <label className="block">
          Тема письма
          <input
            required
            name="subject"
            maxLength={200}
            defaultValue={campaign?.subject}
            className="admin-input"
          />
        </label>
        <label className="block">
          Текст
          <textarea
            required
            name="body"
            maxLength={8000}
            rows={8}
            defaultValue={campaign?.body}
            className="admin-input"
          />
        </label>
        <fieldset className="space-y-2">
          <legend>Подборка изделий</legend>
          {products.map((p) => (
            <label key={p.id} className="flex gap-3">
              <input
                type="checkbox"
                name="product_ids"
                value={p.id}
                defaultChecked={campaign?.product_ids.includes(p.id)}
              />
              {p.name}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-2 max-h-72 overflow-auto">
          <legend>Получатели с согласием на новости</legend>
          {subscribers.map((s) => (
            <label key={s.id} className="flex gap-3">
              <input
                type="checkbox"
                name="recipient_ids"
                value={s.id}
                defaultChecked={campaign?.recipient_ids.includes(s.id)}
              />
              {s.email}
            </label>
          ))}
          {!subscribers.length && <p>Подходящих подписчиков нет</p>}
        </fieldset>
        <label className="block">
          Дата и время отправки (МСК)
          <input
            type="datetime-local"
            name="scheduled_at"
            className="admin-input"
          />
        </label>
      </fieldset>
      <p className="text-sm text-stone-600">
        Сначала сохраните черновик, затем отправьте тест себе и проверьте
        письмо. Изменение содержания требует нового теста. Отписки и блокировки
        проверяются перед отправкой каждого письма.
      </p>
      {!campaign || campaign.state === "draft" ? (
        <div className="flex flex-wrap gap-3">
          <button disabled={pending} value="save" className="admin-button">
            Сохранить черновик
          </button>
          <button disabled={pending} value="test" className="admin-secondary">
            Отправить тест себе
          </button>
          <button
            disabled={pending || !campaign?.tested_at}
            value="schedule"
            className="admin-secondary"
          >
            Запланировать
          </button>
        </div>
      ) : (
        campaign.state !== "cancelled" && (
          <button
            disabled={pending}
            value="cancel"
            className="admin-secondary"
            onClick={(e) => {
              e.preventDefault();
              const f = new FormData();
              for (const [k, v] of Object.entries(campaign))
                if (typeof v === "string") f.set(k, v);
              for (const id of campaign.product_ids)
                f.append("product_ids", id);
              for (const id of campaign.recipient_ids)
                f.append("recipient_ids", id);
              f.set("action", "cancel");
              start(async () => {
                const r = await saveCampaign(f);
                setStatus(r.error ?? r.message ?? "");
                router.refresh();
              });
            }}
          >
            Остановить ожидающие письма
          </button>
        )
      )}
      {status && <p role="status">{status}</p>}
    </form>
  );
}
