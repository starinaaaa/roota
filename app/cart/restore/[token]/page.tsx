import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/db";
import { restoreCartEmail } from "@/lib/actions/email";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Ваша корзина — Roota",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function RestorePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const { data: s } = await createServerClient()
    .from("email_subscriptions")
    .select("id")
    .eq("token", token)
    .eq("purpose", "cart")
    .or("confirmed_at.not.is.null,direct_consent_at.not.is.null")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!s) notFound();
  const { data: d } = await createServerClient()
    .from("checkout_drafts")
    .select("items")
    .eq("subscription_id", s.id)
    .is("completed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!d) notFound();
  return (
    <div className="max-w-xl mx-auto px-6 pt-32 pb-16 space-y-6">
      <h1 className="font-display text-page">Ваша корзина</h1>
      <ul>
        {d.items.map(
          (i: { product_id: string; name: string; quantity: number }) => (
            <li key={i.product_id}>
              {i.name} × {i.quantity}
            </li>
          ),
        )}
      </ul>
      <p>
        Цены, наличие и доставка проверяются заново. Письмо не продлевает
        резерв.
      </p>
      {error && (
        <p role="alert">
          {error === "occupied"
            ? "В текущей корзине уже есть изделия. Подтвердите её замену."
            : "Изделие недоступно или оформление уже завершено. Проверьте каталог."}
        </p>
      )}
      <form action={restoreCartEmail} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <label className="flex gap-2">
          <input type="checkbox" name="replace" />
          Заменить текущую корзину сохранённой
        </label>
        <button className="admin-button">Восстановить корзину</button>
      </form>
      <a href="/catalog" className="underline">
        Перейти в каталог
      </a>
    </div>
  );
}
