import type { PostingEvent } from "./posting-status";
export function orderedHistory(events: PostingEvent[]) {
  return [
    ...new Map(
      events.map((e) => [`${e.status}:${e.status_changed_at}`, e]),
    ).values(),
  ].sort(
    (a, b) => Date.parse(a.status_changed_at) - Date.parse(b.status_changed_at),
  );
}

export function trackingDate(value?: string | null, withTime = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
