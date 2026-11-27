import type { SaleItem } from "./model";
import { reviewArtwork } from "@/lib/review-copy";

export const MARKET_REVIEW_TITLE = "Как керамика устроилась дома?";
export const MARKET_REVIEW_INTRO =
  "Спасибо, что заглянули ко мне на маркет! Если уже распаковали покупку, расскажите, как она вам дома.";
export const MARKET_REVIEW_TERMS =
  "За отзыв пришлю персональный промокод на 10% на керамику в следующем заказе. Код действует 30 дней, один раз. Скидка не распространяется на доставку и не суммируется с другими промокодами. На сайте опубликую отзыв только с вашего разрешения.";
export function marketReviewInvitation(items: SaleItem[]) {
  return {
    subject: "спасибо, что заглянули ко мне на маркет 💛",
    artwork: reviewArtwork.market,
    body: `привет, это Даша из Roota :)\n\n${MARKET_REVIEW_INTRO}\n\nВаша покупка: ${items.map((i) => `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`).join(", ")}.\n\nФорма откроется без регистрации. ${MARKET_REVIEW_TERMS} Телефон в форме нужен, чтобы привязать код.\n\nДаша`,
  };
}
