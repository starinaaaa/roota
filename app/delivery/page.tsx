import { bindPrepositions } from "@/lib/typography";
import Link from "next/link";
import type { Metadata } from "next";
import { getSiteContent } from "@/lib/site";
import { RETURN_SUMMARY } from "@/lib/shop-policies";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/delivery" },
  title: "Доставка и оплата",
  description:
    "Доставка керамики Roota ceramics в пункты Ozon и курьером по Москве и Подмосковью. Стоимость, сроки отправки, оплата и возврат.",
};

export default async function DeliveryPage() {
  const site = await getSiteContent();

  return (
    <div className="px-6 pt-16 md:px-12 md:pt-20 lg:px-16">
      <div className="mx-auto max-w-[1080px] pb-12 pt-9 md:pb-16 md:pt-14">
        <h1 className="font-display text-page text-stone-900">
          Доставка и оплата
        </h1>

        <section aria-labelledby="delivery-heading" className="mt-9 md:mt-12">
          <h2
            id="delivery-heading"
            className="font-body text-caption uppercase tracking-[0.08em] text-stone-600"
          >
            Как получить заказ
          </h2>
          <div className="mt-5 grid border-y border-stone-200 md:grid-cols-2">
            <div className="py-7 md:py-8 md:pr-10 lg:pr-14">
              <h3 className="font-display text-price text-stone-900">
                В пункт Ozon
              </h3>
              <p className="mt-3 font-body text-copy text-stone-800">
                {bindPrepositions(
                  "Выберите доступный пункт выдачи при оформлении заказа. Ozon уведомит вас, когда посылка будет готова к получению.",
                )}
              </p>
              <dl className="mt-5 space-y-3 font-body text-ui">
                <div>
                  <dt className="text-stone-600">Стоимость</dt>
                  <dd className="mt-1 text-stone-900">
                    {bindPrepositions(
                      "Рассчитаем после выбора пункта и покажем до оплаты.",
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-600">Срок доставки</dt>
                  <dd className="mt-1 text-stone-900">
                    {bindPrepositions(
                      "Ориентировочный срок указан при оформлении и отсчитывается после передачи посылки Ozon. Если срок не указан, уточните его у нас до оплаты.",
                    )}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="border-t border-stone-200 py-7 md:border-l md:border-t-0 md:py-8 md:pl-10 lg:pl-14">
              <h3 className="font-display text-price text-stone-900">
                Курьером до двери
              </h3>
              <p className="mt-3 font-body text-copy text-stone-800">
                {bindPrepositions(
                  "Яндекс Доставка по Москве и Подмосковью. Студия оформит доставку и передаст заказ курьеру.",
                )}
              </p>
              <dl className="mt-5 space-y-3 font-body text-ui">
                <div>
                  <dt className="text-stone-600">Стоимость</dt>
                  <dd className="mt-1 text-stone-900">
                    {bindPrepositions(
                      "Согласуем в Telegram. Курьера вы оплачиваете отдельно от изделий в приложении.",
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-600">Время доставки</dt>
                  <dd className="mt-1 text-stone-900">
                    {bindPrepositions(
                      "Напишем в Telegram в течение суток после заказа и договоримся об удобном времени.",
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <div className="divide-y divide-stone-200">
          <section
            aria-labelledby="dispatch-heading"
            className="grid gap-3 py-7 md:grid-cols-[240px_1fr] md:gap-10 md:py-9"
          >
            <h2 id="dispatch-heading" className="font-display text-price">
              Когда отправим
            </h2>
            <p className="max-w-2xl font-body text-copy text-stone-800">
              {bindPrepositions(
                "Готовые изделия передаём в Ozon за 1–3 рабочих дня после оплаты. Время отправки курьером согласуем отдельно. Срок изготовления предзаказа указан в карточке изделия.",
              )}
            </p>
          </section>

          <section
            aria-labelledby="payment-heading"
            className="grid gap-3 py-7 md:grid-cols-[240px_1fr] md:gap-10 md:py-9"
          >
            <h2 id="payment-heading" className="font-display text-price">
              Оплата
            </h2>
            <p className="max-w-2xl font-body text-copy text-stone-800">
              {bindPrepositions(
                "Заказ оплачивается на сайте через Robokassa. Стоимость изделий и доставки Ozon покажем до оплаты. Электронный чек придёт на почту, указанную в заказе.",
              )}
            </p>
          </section>

          <section
            aria-labelledby="packaging-heading"
            className="grid gap-3 py-7 md:grid-cols-[240px_1fr] md:gap-10 md:py-9"
          >
            <h2 id="packaging-heading" className="font-display text-price">
              Бережная упаковка
            </h2>
            <div className="max-w-2xl space-y-3 font-body text-copy text-stone-800">
              <p>
                {bindPrepositions(
                  "Каждое изделие заворачиваем в сотовый крафт и защищаем наполнителем в картонной коробке.",
                )}
              </p>
              <p>
                {bindPrepositions(
                  "Если керамика повредилась в дороге, напишите нам: укажите номер заказа и по возможности приложите фото изделия и упаковки. Видео распаковки не обязательно.",
                )}
              </p>
              <a
                href={`mailto:${site.email}`}
                className="inline-block break-all py-1 underline underline-offset-4 transition-colors hover:text-stone-600"
              >
                {site.email}
              </a>
            </div>
          </section>

          <section
            id="returns"
            aria-labelledby="returns-heading"
            className="grid scroll-mt-28 gap-3 py-7 md:grid-cols-[240px_1fr] md:gap-10 md:py-9"
          >
            <h2 id="returns-heading" className="font-display text-price">
              Возврат
            </h2>
            <div className="max-w-2xl space-y-3 font-body text-copy text-stone-800">
              <p>{bindPrepositions(RETURN_SUMMARY)}</p>
              <p>
                Для оформления напишите на{" "}
                <a
                  href={`mailto:${site.email}`}
                  className="break-all underline underline-offset-4 transition-colors hover:text-stone-600"
                >
                  {site.email}
                </a>
                {bindPrepositions(
                  ". Согласуем обратную отправку. Доставка качественного товара обратно — за счёт покупателя.",
                )}
              </p>
              <Link
                href="/offer#returns"
                prefetch={false}
                className="inline-block py-1 underline underline-offset-4 transition-colors hover:text-stone-600"
              >
                Полные условия возврата
              </Link>
            </div>
          </section>
        </div>

        <div className="flex flex-col items-start gap-3 border-t border-stone-200 pt-7 font-body text-ui md:flex-row md:items-center md:justify-between md:pt-9">
          <p className="text-stone-600">Остались вопросы о заказе?</p>
          <a
            href={site.telegram}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-3 underline underline-offset-4 transition-colors hover:text-stone-600"
          >
            Написать в Telegram <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </div>
  );
}
