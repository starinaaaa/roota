type ReviewItem = {
  product_name: string;
  quantity: number;
  configuration?: unknown;
  category_slug?: string | null;
  configurator?: string | null;
};

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
    ? "Уже собрали свою первую композицию? Расскажите, как вам керамический конструктор «Сад». Если захочется, добавьте фото: очень интересно увидеть, что у вас выросло."
    : onlyPlates
      ? count === 1
        ? "Расскажите, как вам тарелочка Roota. Если захочется, добавьте фото: нам интересно увидеть её у вас дома."
        : "Расскажите, как вам тарелочки Roota. Если захочется, добавьте фото: нам интересно увидеть их у вас дома."
      : "Расскажите, как вам изделия Roota. Если захочется, добавьте фото: нам интересно увидеть их у вас дома.";
  return { subject, introduction };
}

export const REVIEW_REWARD_TERMS =
  "В благодарность за честный отзыв подарим персональный промокод на скидку 10% на изделия в следующем заказе. Он действует 30 дней с выдачи, один раз, для телефона из этого заказа. На доставку скидка не распространяется и с другими промокодами не суммируется. Любая оценка важна; фото и разрешение на публикацию — по желанию.";

export function reviewInvitation(items: ReviewItem[]) {
  const copy = reviewCopy(items);
  return {
    subject: copy.subject,
    body: `${copy.introduction}\n\nОставьте отзыв на сайте или напишите нам в Telegram.\n\n${REVIEW_REWARD_TERMS}\n\nЗа отзыв на сайте код появится сразу и придёт на почту. За отзыв в Telegram пришлём его после подтверждения студией.`,
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
