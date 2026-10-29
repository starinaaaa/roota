import type { z } from "zod";
import type { postingInfoSchema } from "./posting-status";

export type CarrierPosting = {
  posting_number: string;
  request_id: number;
  status?: string;
  status_changed_at?: string;
  original_delivery_at?: string | null;
  delivery_at?: string | null;
  storage_expires_at?: string | null;
  estimated_delivery_days?: number | null;
  history?: import("./posting-status").PostingEvent[];
  history_for_status_changed_at?: string;
  history_error?: boolean;
};
export function shipmentPostings(shipment: {
  posting_number?: string | null;
  status_history?: { postings?: CarrierPosting[] } | null;
}): CarrierPosting[] {
  const postings = shipment.status_history?.postings;
  return Array.isArray(postings) && postings.length
    ? postings
    : shipment.posting_number
      ? [{ posting_number: shipment.posting_number, request_id: 1 }]
      : [];
}

// An order reaches a milestone only after every parcel reaches it.
export function aggregatePostingStatus(
  postings: z.infer<typeof postingInfoSchema>["postings"],
) {
  if (!postings.length) throw new Error("POSTING_NOT_FOUND");
  const statuses = postings.map((p) => p.status);
  if (statuses.every((s) => s === "canceled")) return "canceled";
  if (
    statuses.some((s) =>
      ["canceled", "forming_failed", "not_accepted_to_delivery"].includes(s),
    )
  )
    return "forming_failed";
  const rank: Record<string, number> = {
    created: 0,
    forming: 0,
    ready_for_shipping: 0,
    in_container: 0,
    acceptance_in_progress: 0,
    on_way: 1,
    in_courier_service: 1,
    in_delivery_point: 2,
    delivered: 3,
  };
  if (statuses.some((s) => rank[s] === undefined)) return "unknown";
  return statuses.reduce((slowest, status) =>
    rank[status] < rank[slowest] ? status : slowest,
  );
}

export function carrierStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    created: "Создано",
    forming: "Собирается",
    ready_for_shipping: "Готово к отправке",
    in_container: "В грузоместе",
    acceptance_in_progress: "Принимается Ozon",
    on_way: "В пути",
    in_courier_service: "У курьера",
    in_delivery_point: "В пункте выдачи",
    delivered: "Получено",
    canceled: "Отменено",
    forming_failed: "Ошибка сборки",
    not_accepted_to_delivery: "Не принято в доставку",
  };
  return status ? (labels[status] ?? "Уточняем статус") : "Ещё не создано";
}
