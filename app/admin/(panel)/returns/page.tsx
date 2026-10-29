import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { storage } from "@/lib/storage";
import {
  returnReasons,
  terminalReturnStatuses,
} from "@/lib/delivery/return-model";
import type { StoredCarrierReturn } from "@/lib/delivery/returns-data";
import type { CustomerReturnRequest } from "@/lib/customer-returns";
import ReturnRequestReview from "@/components/admin/ReturnRequestReview";
import CarrierReturns from "@/components/admin/CarrierReturns";
import { trackingDate } from "@/lib/delivery/tracking-format";
export const dynamic = "force-dynamic";
export default async function ReturnsPage() {
  await requireAdmin();
  const pool = getPool();
  let data;
  try {
    data = await Promise.all([
      pool.query<
        CustomerReturnRequest & { order_id: string; order_number: string }
      >(
        `select r.*,o.order_number from customer_return_requests r join orders o on o.id=r.order_id order by (r.status='closed'),r.created_at desc limit 100`,
      ),
      pool.query<StoredCarrierReturn>(
        `select r.*,o.order_number from delivery_returns r left join orders o on o.id=r.order_id order by (r.status=any($1::text[])),r.status_changed_at desc limit 100`,
        [terminalReturnStatuses],
      ),
      pool.query(
        `select synced_at,last_error,cursor from delivery_return_sync where id`,
      ),
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === "42P01")
      return (
        <p className="admin-card">
          Раздел возвратов подготовлен. Перед включением требуется миграция базы
          20261028_delivery_tracking_returns.sql.
        </p>
      );
    throw new Error("Не удалось загрузить возвраты. Обновите страницу.");
  }
  const [applications, returns, sync] = data;
  const requests = await Promise.all(
    applications.rows.map(async (request) => ({
      ...request,
      photoUrls: (
        await Promise.all(
          request.photos.map(async (path) => {
            if (!path.startsWith(`${request.order_id}/`)) return null;
            return (
              (await storage.from("return-photos").createSignedUrl(path, 900))
                .data?.signedUrl ?? null
            );
          }),
        )
      ).filter((url): url is string => Boolean(url)),
    })),
  );
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-xl">Заявки покупателей на возврат</h2>
        <p>
          Покупатель подаёт заявку со страницы полученного заказа. Рассмотрите
          причину и фотографии, затем согласуйте решение. Оплата и обратная
          доставка выполняются отдельно.
        </p>
        {!requests.length && <p>Заявок пока нет.</p>}
        {requests.map((request) => (
          <article key={request.id} className="admin-card space-y-4">
            <h3>
              <Link
                className="underline"
                href={`/admin/orders/${request.order_id}`}
              >
                Заказ {request.order_number}
              </Link>{" "}
              · {returnReasons[request.reason]}
            </h3>
            <p>{trackingDate(String(request.created_at), true)} (МСК)</p>
            <p className="whitespace-pre-wrap">{request.description}</p>
            <div className="flex flex-wrap gap-3">
              {request.photoUrls.map((url, index) => (
                <a
                  key={index}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  {/* Private signed images must bypass the public image optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Фотография к заявке, ${index + 1}`}
                    width={160}
                    height={160}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-40 w-40 object-contain"
                  />
                </a>
              ))}
            </div>
            {request.photos.length > request.photoUrls.length && (
              <p role="alert">
                Часть фотографий не удалось открыть. Обновите страницу или
                проверьте хранилище.
              </p>
            )}
            <ReturnRequestReview
              id={request.id}
              status={request.status}
              reply={request.studio_reply}
            />
          </article>
        ))}
        {requests.length === 100 && (
          <p>Показаны первые 100 заявок, незавершённые — сначала.</p>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-xl">Возвратные посылки Ozon</h2>
        <p>
          Здесь уже оформленные Ozon возвраты, отказы и невыкупы. Они не создают
          заявку покупателя и не означают возврат оплаты.
        </p>
        <p>
          Последняя проверка:{" "}
          {trackingDate(
            sync.rows[0]?.synced_at ? String(sync.rows[0].synced_at) : null,
            true,
          ) ?? "Ещё не выполнялась"}
          .
        </p>
        {sync.rows[0]?.last_error && (
          <p role="alert">{String(sync.rows[0].last_error)}</p>
        )}
        {sync.rows[0]?.cursor && (
          <p>Загрузка списка продолжается следующими порциями.</p>
        )}
        {!returns.rows.length && <p>Возвратных отправлений пока нет.</p>}
        {returns.rows.map((item) => (
          <section key={item.return_number} className="space-y-2">
            {item.order_id ? (
              <Link
                className="underline"
                href={`/admin/orders/${item.order_id}`}
              >
                Заказ {item.order_number}
              </Link>
            ) : (
              <p>
                Связь с заказом Roota не определена — проверьте номер в Ozon.
              </p>
            )}
            <CarrierReturns returns={[item]} />
          </section>
        ))}
        {returns.rows.length === 100 && (
          <p>
            Показаны первые 100 отправлений, активные и проблемные — сначала.
          </p>
        )}
      </section>
    </div>
  );
}
