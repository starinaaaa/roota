export type WheelTask = {
  id: string;
  title: string;
  status: "active" | "done" | "deferred";
  started_at: string | null;
  completed_at: string | null;
};
export type WheelData = {
  user: { id: string; name: string; owner: boolean };
  profile: {
    user_id: string;
    name: string;
    skipped: string[];
    selected_id: string | null;
  };
  tasks: WheelTask[];
  people: { user_id: string; name: string }[];
  readonly: boolean;
};
export function normalizeName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru-RU");
}
export function eligibleTasks(tasks: WheelTask[], skipped: string[]) {
  const excluded = new Set(skipped);
  return tasks.filter((t) => t.status === "active" && !excluded.has(t.id));
}
export function parseTasks(text: string) {
  return text
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
}
export function landingRotation(
  previous: number,
  index: number,
  count: number,
) {
  const target = (360 - ((index + 0.5) * 360) / count) % 360;
  return previous + 360 * 6 + ((target - (previous % 360) + 360) % 360);
}
