import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import {
  saveEmailSettings,
  saveEmailTemplate,
  testEmailTemplate,
  cancelEmailMessage,
  retryRejectedEmail,
} from "@/lib/actions/email-admin";
import { renderEmail } from "@/lib/email/templates";
export const dynamic = "force-dynamic";
export default async function MessagesPage() {
  await requireAdmin();
  const db = createServerClient();
  const [settings, templates, messages, blocks] = await Promise.all([
    db.from("email_settings").select("*").eq("id", 1).single(),
    db.from("email_templates").select("*").order("kind"),
    db
      .from("email_messages")
      .select(
        "id,kind,recipient,state,scheduled_at,attempts,provider_job_id,last_error,payload",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("email_blocks").select("email,reason").limit(100),
  ]);
  if (settings.error || templates.error || messages.error || blocks.error)
    throw new Error("Не удалось загрузить почту");
  const s = settings.data;
  return (
    <div className="space-y-8">
      <h1 className="font-display text-page">Сообщения</h1>
      <p>
        Отправитель: ROOTA &lt;hello@roota.moscow&gt;. Ответы — в почту студии.{" "}
        {process.env.CUSTOMER_EMAILS_ENABLED === "true"
          ? "Транспорт включён."
          : "Транспорт отключён переменной приложения."}
      </p>
      <form action={saveEmailSettings} className="admin-card space-y-4">
        <label className="flex gap-2">
          <input type="checkbox" name="enabled" defaultChecked={s.enabled} />
          Автоматическая почта
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            name="marketing_enabled"
            defaultChecked={s.marketing_enabled}
          />
          Поступления, корзины и отзывы (снять для аварийной остановки)
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            name="test_mode"
            defaultChecked={s.test_mode}
          />
          Только тестовые адреса
        </label>
        <label className="block">
          Тестовые адреса через запятую
          <input
            name="test_recipients"
            className="admin-input"
            defaultValue={s.test_recipients.join(", ")}
            required
          />
        </label>
        <label className="block">
          Напоминание через, часов
          <input
            type="number"
            name="reminder_delay_hours"
            min="1"
            max="168"
            className="admin-input"
            defaultValue={s.reminder_delay_hours}
          />
        </label>
        <label className="block">
          Отзыв через, часов после получения
          <input
            type="number"
            name="review_delay_hours"
            min="1"
            max="720"
            className="admin-input"
            defaultValue={s.review_delay_hours}
          />
        </label>
        <button className="admin-button">Сохранить настройки</button>
      </form>
      <h2 className="text-xl">Шаблоны и сценарии</h2>
      <p>
        Переменные:{" "}
        {
          "{{number}}, {{items}}, {{total}}, {{reservation}}, {{product}}, {{purpose}}"
        }
        . Ссылка и отписка добавляются автоматически.
      </p>
      {templates.data.map((t) => (
        <details key={t.kind} className="admin-card">
          <summary>
            {t.kind} — {t.subject}
          </summary>
          <form action={saveEmailTemplate} className="space-y-3 mt-4">
            <input type="hidden" name="kind" value={t.kind} />
            <label className="block">
              Тема
              <input
                name="subject"
                className="admin-input"
                maxLength={200}
                defaultValue={t.subject}
                required
              />
            </label>
            <label className="block">
              Текст
              <textarea
                name="body"
                className="admin-input"
                rows={5}
                defaultValue={t.body.replaceAll("\\n", "\n")}
                required
              />
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={t.enabled}
              />
              Сценарий включён
            </label>
            <button className="admin-button">Сохранить шаблон</button>
          </form>
          <form action={testEmailTemplate} className="mt-3">
            <input type="hidden" name="kind" value={t.kind} />
            <button className="admin-secondary">
              Отправить тест в hello@roota.moscow
            </button>
          </form>
          <iframe
            title={`Предпросмотр ${t.kind}`}
            sandbox=""
            className="w-full h-80 mt-4 border border-stone-200"
            srcDoc={
              renderEmail(
                t,
                {
                  number: "GL-ТЕСТ",
                  total: "3500",
                  items: "Тарелочка × 1",
                  reservation: "Резерв 30 минут",
                  product: "Тарелочка",
                  date: "14 октября 2026, 12:00 МСК",
                  shipping: "350 ₽",
                  payment: "Оплачено · пример",
                  recipient: "Покупатель Roota",
                  delivery: "Пункт выдачи Ozon",
                  address: "Адрес выбранного пункта",
                  tracking: "Появится после оформления отправления",
                  fulfillment:
                    "Готовые изделия передаём в доставку в течение 1–3 рабочих дней после оплаты.",
                  purpose: "уведомление",
                },
                "https://roota.moscow",
                "Открыть Roota",
                "https://roota.moscow",
                t.kind.startsWith("order_"),
                [{ name: "Тарелочка", quantity: 1, price: 3150 }],
              ).html
            }
          />
        </details>
      ))}
      <h2 className="text-xl">Очередь и доставка (последние 100)</h2>
      <div className="overflow-auto">
        <table className="w-full text-caption">
          <thead>
            <tr>
              <th>Письмо</th>
              <th>Адрес</th>
              <th>Статус</th>
              <th>Отправка</th>
              <th>Ошибка</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {messages.data.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="p-2">
                  {m.payload?.test ? "Тест · " : ""}
                  {m.kind}
                </td>
                <td>{m.recipient}</td>
                <td>
                  {m.state}
                  <br />
                  {m.provider_job_id}
                </td>
                <td>
                  {new Date(m.scheduled_at).toLocaleString("ru-RU", {
                    timeZone: "Europe/Moscow",
                  })}
                  <br />
                  Попыток: {m.attempts}
                </td>
                <td>{m.last_error}</td>
                <td>
                  {m.state === "failed" &&
                    !m.provider_job_id &&
                    m.attempts < 3 && (
                      <form action={retryRejectedEmail}>
                        <input type="hidden" name="id" value={m.id} />
                        <button className="admin-secondary">
                          Повторить после исправления
                        </button>
                      </form>
                    )}
                  {m.state === "pending" && (
                    <form action={cancelEmailMessage}>
                      <input type="hidden" name="id" value={m.id} />
                      <button className="admin-secondary">Отменить</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="text-xl">Блокировки адресов</h2>
      {blocks.data.map((b) => (
        <p key={b.email}>
          {b.email}: {b.reason}
        </p>
      ))}
      <p>
        Неопределённые отправки автоматически не повторяются. Проверьте журнал
        Unisender Go по идентификатору перед дальнейшими действиями.
      </p>
    </div>
  );
}
