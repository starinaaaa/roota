import Link from "next/link";
import { bindPrepositions } from "@/lib/typography";
import { RETURN_SUMMARY } from "@/lib/shop-policies";

export default function PurchaseHelp({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="font-body text-caption leading-relaxed text-stone-600 space-y-3">
      <p>
        {bindPrepositions(
          compact
            ? "Ozon — стоимость до оплаты. Курьер по Москве и Подмосковью — за отдельную плату в приложении."
            : "Доставка в ПВЗ Ozon: готовые изделия отправляем за 1–3 рабочих дня после оплаты; стоимость и доступный срок перевозки — при оформлении. Курьер по Москве и Подмосковью оплачивается отдельно в приложении; свяжемся в Telegram в течение суток и согласуем время.",
        )}
      </p>
      {!compact && <p>{bindPrepositions(RETURN_SUMMARY)}</p>}
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        <Link
          href="/delivery"
          onClick={onNavigate}
          className="underline underline-offset-4 hover:text-stone-900"
        >
          Доставка и оплата
        </Link>
        <Link
          href="/delivery#returns"
          onClick={onNavigate}
          className="underline underline-offset-4 hover:text-stone-900"
        >
          Возврат и повреждение
        </Link>
      </div>
    </div>
  );
}
