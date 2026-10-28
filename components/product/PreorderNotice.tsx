import { estimatedReadyLabel, productionEstimate } from "@/lib/preorder-copy";

export default function PreorderNotice({
  days,
  readyOn,
  garden = false,
}: {
  days: number | null | undefined;
  readyOn?: string | null;
  garden?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#687851]/30 bg-[#f1f3eb] p-5 text-stone-900">
      <p className="font-body text-ui font-medium uppercase tracking-[0.08em] text-[#526444]">
        Предзаказ
      </p>
      <p className="mt-2 font-display text-price leading-snug">
        Изготовление — {productionEstimate(days)}
      </p>
      {readyOn && (
        <p className="mt-3 text-copy leading-relaxed">
          Если оплатить сегодня — {estimatedReadyLabel(readyOn)}.
        </p>
      )}
      <p className="mt-3 text-ui leading-relaxed text-stone-700">
        {garden
          ? "Начнём после оплаты. Кубикам нужно хорошо высохнуть перед обжигом!"
          : "Начнём после оплаты. Весь заказ отправим, когда будут готовы все изделия."}{" "}
        Срок доставки добавляется отдельно.
      </p>
    </div>
  );
}
