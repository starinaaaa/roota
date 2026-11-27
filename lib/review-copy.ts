type ReviewItem = {
  product_name: string;
  quantity: number;
  configuration?: unknown;
  category_slug?: string | null;
  configurator?: string | null;
};

export const reviewArtwork = {
  order: "/images/review/order.png",
  garden: "/images/review/garden.png",
  market: "/images/review/market.png",
  thanks: "/images/review/thanks.png",
} as const;
export type ReviewArtwork = (typeof reviewArtwork)[keyof typeof reviewArtwork];

export const reviewPageArtwork = {
  order: "/images/review/page-order.png",
  garden: "/images/review/page-garden.png",
  market: "/images/review/page-market.png",
  orderThanks: "/images/review/page-order-thanks.png",
  marketThanks: "/images/review/page-market-thanks.png",
} as const;
export type ReviewPageArtwork =
  (typeof reviewPageArtwork)[keyof typeof reviewPageArtwork];

export function reviewCopy(items: ReviewItem[]) {
  const garden = (i: ReviewItem) =>
    Boolean(i.configuration) ||
    i.configurator === "garden" ||
    /(?:конструктор|(?:^|[«"\s])сад(?:[»"\s]|$))/iu.test(i.product_name);
  const plate = (i: ReviewItem) =>
    /тарел/iu.test(i.product_name) ||
    /plates?|tarel/iu.test(i.category_slug ?? "");
  const onlyGarden = items.length > 0 && items.every(garden);
  const onlyPlates = items.length > 0 && items.every(plate);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const subject = onlyGarden
    ? "Как растёт ваш керамический «Сад»?"
    : onlyPlates
      ? count === 1
        ? "Как ваша тарелочка устроилась дома?"
        : "Как ваши тарелочки устроились дома?"
      : "Как изделия Roota устроились у вас дома?";
  const introduction = onlyGarden
    ? "Уже успели что-нибудь собрать? Мне интересно, какие кусочки у вас подружились."
    : onlyPlates
      ? count === 1
        ? "Уже успели с неё позавтракать? Расскажите, как вам тарелка в обычной жизни."
        : "Расскажите, какой тарелкой чаще пользуетесь и почему."
      : "Расскажите, чем уже успели попользоваться и как вам.";
  return {
    subject,
    introduction,
    artwork: onlyGarden ? reviewArtwork.garden : reviewArtwork.order,
    pageArtwork: onlyGarden
      ? reviewPageArtwork.garden
      : reviewPageArtwork.order,
  };
}

export const REVIEW_REWARD_TERMS =
  "В благодарность за отзыв пришлю персональный промокод на 10% на изделия в следующем заказе. Он действует 30 дней с выдачи, один раз, для телефона из этого заказа. На доставку скидка не распространяется и с другими промокодами не суммируется. Фото и разрешение на публикацию — по желанию.";

export function reviewInvitation(items: ReviewItem[]) {
  const copy = reviewCopy(items);
  return {
    subject: copy.subject,
    artwork: copy.artwork,
    body: `Привет, это Даша из Roota :)\n\n${copy.introduction}\n\nФорма откроется без регистрации. Если хочется, можно добавить фотографии.\n\n${REVIEW_REWARD_TERMS}\n\nПосле отзыва промокод появится на сайте и придёт на почту.\n\nДаша`,
  };
}

export function reviewTelegramUrl(telegram: string, number: string) {
  const url = new URL(telegram);
  if (url.protocol !== "https:" || url.hostname !== "t.me")
    throw new Error("INVALID_TELEGRAM_URL");
  url.searchParams.set(
    "text",
    `Здравствуйте! Хочу оставить отзыв о заказе ${number}: `,
  );
  return url.toString();
}

export function rewardExpiry(value: string | Date) {
  return (
    new Date(value).toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " МСК"
  );
}
