/** Public estimates; exact production dates stay in the admin workspace. */
export function productionEstimate(days: number | null | undefined) {
  if (!days || !Number.isFinite(days) || days < 1)
    return "срок уточним со студией";
  const wholeDays = Math.ceil(days);
  if (wholeDays % 7 !== 0)
    return `примерно ${wholeDays} ${plural(wholeDays, "день", "дня", "дней")}`;
  const weeks = wholeDays / 7;
  return `примерно ${weeks} ${plural(weeks, "неделя", "недели", "недель")}`;
}

function plural(n: number, one: string, few: string, many: string) {
  if (n % 100 >= 11 && n % 100 <= 14) return many;
  return n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many;
}

export function estimatedReadyLabel(value: string | Date) {
  const date =
    typeof value === "string" && value.length === 10
      ? new Date(`${value}T12:00:00Z`)
      : new Date(value);
  return `примерно ${date.toLocaleDateString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
  })}, но постараемся быстрее`;
}
