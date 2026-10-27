export const productionStages = {
  queued: "В очереди",
  forming: "Лепка",
  drying: "Сушка",
  firing: "Обжиг",
  glazing: "Глазуровка",
  ready: "Готово",
} as const;
export function moscowDate(value: string | Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function plannedReadyDate(
  paidAt: string | Date | null | undefined,
  days: number,
) {
  if (!paidAt || !Number.isFinite(days) || days < 1) return null;
  const date = new Date(`${moscowDate(paidAt)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function readyDateLabel(value: string | Date) {
  return new Date(
    typeof value === "string" && value.length === 10
      ? `${value}T12:00:00Z`
      : value,
  ).toLocaleDateString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function thirtyDayPeriodStart() {
  return moscowDate(new Date(Date.now() - 29 * 86400000));
}
