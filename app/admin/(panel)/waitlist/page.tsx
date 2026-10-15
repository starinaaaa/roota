import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/db";
import { markWaitlistNotified } from "@/lib/actions/waitlist-admin";
import { siteUrl } from "@/lib/seo";
export const dynamic = "force-dynamic";

type Entry = {
  id: string;
  contact: string | null;
  email: string | null;
  telegram: string | null;
  created_at: string;
  notified_at: string | null;
  product: {
    name: string;
    slug: string;
    stock_qty: number;
    publication_status: string;
    is_active: boolean;
  } | null;
};
export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const done = params.done === "1";
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(params.page) || 1)),
  );
  let query = createServerClient()
    .from("waitlist")
    .select(
      "id,contact,email,telegram,created_at,notified_at,product:products(name,slug,stock_qty,publication_status,is_active)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });
  query = done
    ? query.not("notified_at", "is", null)
    : query.is("notified_at", null);
  const { data, error, count } = await query.range(
    (page - 1) * 30,
    page * 30 - 1,
  );
  if (error) throw new Error("Не удалось загрузить заявки");
  const entries = (data ?? []) as unknown as Entry[];
  const suffix = done ? "&done=1" : "";
  return (
    <div className="space-y-6">
      <h2 className="text-xl">Заявки на поступление</h2>
      <p className="max-w-2xl text-stone-700">
        Откройте письмо, отправьте его из своей почты и только после отправки
        отметьте заявку как обработанную. Автоматическая рассылка не включена.
      </p>
      <nav className="flex gap-4">
        <Link className="underline" href="/admin/waitlist">
          Ожидают уведомления
        </Link>
        <Link className="underline" href="/admin/waitlist?done=1">
          Уведомлены
        </Link>
      </nav>
      {entries.length === 0 && <p>Заявок пока нет.</p>}
      <ul className="space-y-4">
        {entries.map((entry) => {
          const contact = entry.contact || entry.email || entry.telegram || "";
          const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
            ? contact
            : null;
          const telegram =
            !email && /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(contact)
              ? contact.replace(/^@/, "")
              : null;
          const available =
            entry.product?.publication_status === "published" &&
            entry.product?.is_active &&
            entry.product.stock_qty > 0;
          const subject = `Roota: ${entry.product?.name ?? "изделие"} в наличии`;
          const body = `Здравствуйте! Вы просили сообщить о поступлении изделия «${entry.product?.name ?? ""}». Оно снова в наличии: ${siteUrl("/product/" + entry.product?.slug)}\n\nRoota ceramics`;
          return (
            <li
              key={entry.id}
              className="border border-stone-200 p-5 space-y-3"
            >
              <p className="font-medium">
                {entry.product?.name ?? "Изделие удалено"} ·{" "}
                {available ? "В наличии" : "Недоступно для покупки"}
              </p>
              <p>
                {contact} ·{" "}
                {new Date(entry.created_at).toLocaleDateString("ru-RU", {
                  timeZone: "Europe/Moscow",
                })}
              </p>
              {done ? (
                <p>
                  Уведомление отмечено{" "}
                  {new Date(entry.notified_at!).toLocaleDateString("ru-RU", {
                    timeZone: "Europe/Moscow",
                  })}
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {available && email && (
                    <a
                      className="admin-secondary"
                      href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
                    >
                      Подготовить письмо
                    </a>
                  )}
                  {available && telegram && (
                    <a
                      className="admin-secondary"
                      href={`https://t.me/${telegram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Написать в Telegram
                    </a>
                  )}
                  <form action={markWaitlistNotified}>
                    <input type="hidden" name="id" value={entry.id} />
                    <button className="admin-secondary">
                      Уведомление отправлено
                    </button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <nav className="flex gap-4">
        {page > 1 && (
          <Link
            className="underline"
            href={`/admin/waitlist?page=${page - 1}${suffix}`}
          >
            Назад
          </Link>
        )}
        {page * 30 < (count ?? 0) && (
          <Link
            className="underline"
            href={`/admin/waitlist?page=${page + 1}${suffix}`}
          >
            Далее
          </Link>
        )}
      </nav>
    </div>
  );
}
