import { z } from "zod";
const date = z.iso.datetime({ offset: true });
export const returnEventSchema = z.object({
  return_status: z.string().min(1).max(100),
  changed_at: date,
});
export const carrierReturnSchema = z.object({
  return_number: z.string().min(1).max(200),
  return_external_id: z.string().max(300).nullish(),
  status: z.string().min(1).max(100),
  status_changed_at: date,
  created_at: date.nullish(),
  shipment_method_id: z.number().int().positive(),
  current_placement_name: z.string().max(1000).nullish(),
  current_placement_address: z.string().max(2000).nullish(),
  cancellation_reason: z.string().max(4000).nullish(),
  cancellation_responsible: z.string().max(100).nullish(),
});
export const returnSearchSchema = z.object({
  returns: z.array(carrierReturnSchema),
  next_cursor: z.string().nullish(),
});
export const returnHistorySchema = z.object({
  status_history: z.array(returnEventSchema),
});
export type CarrierReturn = z.infer<typeof carrierReturnSchema>;
export type ReturnEvent = z.infer<typeof returnEventSchema>;
export const terminalReturnStatuses = ["received", "utilized", "written_off"];
export function returnStatusLabel(status: string) {
  return (
    (
      {
        moving: "Возвращается в студию",
        at_pickup_point: "Нужно забрать возврат",
        at_the_pick_up_point: "Нужно забрать возврат",
        received: "Студия забрала возврат",
        utilization: "Передано на утилизацию",
        utilized: "Утилизировано",
        written_off: "Списано Ozon",
        looking_for: "Ozon разыскивает возврат",
      } as Record<string, string>
    )[status] ?? "Уточняем статус возврата"
  );
}
export function returnAttention(status: string) {
  return !["moving", "received"].includes(status);
}
export const returnReasons = {
  damaged: "Повреждение изделия",
  wrong_item: "Получено другое изделие",
  other: "Другая причина",
} as const;
export const requestStatuses = {
  new: "Заявка получена",
  reviewing: "Студия рассматривает заявку",
  agreed: "Решение согласовано",
  closed: "Обращение завершено",
} as const;
export const returnRequestSchema = z.object({
  reason: z.enum(["damaged", "wrong_item", "other"]),
  description: z
    .string()
    .trim()
    .min(10, "Опишите ситуацию подробнее (от 10 символов).")
    .max(4000),
});
