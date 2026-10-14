import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { confirmEmail, unsubscribeEmail } from "@/lib/actions/email";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Настройки почты — Roota",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function EmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ confirmed?: string; unsubscribed?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const { data: s } = await createServerClient()
    .from("email_subscriptions")
    .select("purpose,confirmed_at,direct_consent_at,revoked_at,expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!s) notFound();
  const activeConsent =
    !!s.confirmed_at ||
    (["restock", "cart", "news"].includes(s.purpose) && !!s.direct_consent_at);
  const expired =
    Date.parse(s.expires_at) < new Date().getTime() &&
    (s.purpose === "cart" || !activeConsent);
  return (
    <div className="max-w-xl mx-auto px-6 pt-32 pb-16 space-y-6">
      <h1 className="font-display text-page">Почта Roota</h1>
      {query.confirmed && <p role="status">Email подтверждён. Спасибо!</p>}
      {query.unsubscribed && (
        <p role="status">
          Вы отписались. Служебные письма о действующем заказе продолжат
          приходить.
        </p>
      )}
      {!activeConsent && !s.revoked_at && !expired ? (
        <form action={confirmEmail}>
          <input type="hidden" name="token" value={token} />
          <p className="mb-4">
            Подтвердите подписку:{" "}
            {s.purpose === "cart"
              ? "ссылка на корзину и одно напоминание"
              : s.purpose === "restock"
                ? "уведомление о поступлении конкретного изделия"
                : "новости студии"}
            .
          </p>
          <button className="admin-button">Подтвердить email</button>
        </form>
      ) : (
        <p>
          {expired
            ? "Срок ссылки истёк. Запросите новое письмо."
            : s.revoked_at
              ? "Подписка отключена."
              : "Подписка активна."}
        </p>
      )}
      {!s.revoked_at && (
        <form action={unsubscribeEmail} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <label className="flex gap-2">
            <input type="checkbox" name="all" />
            Отписаться от всех рекламных писем Roota
          </label>
          <button className="admin-secondary">Отписаться</button>
        </form>
      )}
      <a href="/privacy" className="underline">
        Политика конфиденциальности
      </a>
    </div>
  );
}
