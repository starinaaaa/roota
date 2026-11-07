/** Pure, shared by the site and extension. No FNS session/network access. */
export function kopecks(value) {
  const s = String(value);
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(s))
    throw new Error(
      "Некорректная сумма: нужны рубли и не больше двух знаков копеек",
    );
  const [r, k = ""] = s.split(".");
  const n = Number(BigInt(r) * 100n + BigInt(k.padEnd(2, "0")));
  if (!Number.isSafeInteger(n)) throw new Error("Сумма слишком велика");
  return n;
}
export const rubles = (n) => {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("Некорректные копейки");
  return `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
};
export function receiptPlan(job) {
  if (!job || !["cash", "transfer"].includes(job.payment_method))
    throw new Error(
      "Только наличные и прямые переводы; Робокассу повторно не фискализируем",
    );
  if (job.buyer_type && job.buyer_type !== "individual")
    throw new Error("Для организации нужен отдельный сценарий");
  if (!Array.isArray(job.items) || !job.items.length)
    throw new Error("В снимке нет позиций");
  const paid = new Date(job.paid_at);
  if (!job.paid_at || !Number.isFinite(paid.getTime()))
    throw new Error("Нет подтверждённой даты расчёта");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(paid)
      .map((x) => [x.type, x.value]),
  );
  const rows = [];
  for (const item of job.items) {
    if (
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 128 ||
      item.kind !== "goods"
    )
      throw new Error("Некорректное наименование из снимка продажи");
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 100
    )
      throw new Error("Некорректное количество");
    const total = kopecks(item.sum);
    if (total < item.quantity)
      throw new Error("Стоимость единицы меньше копейки");
    if (
      item.unitPrice !== undefined &&
      kopecks(item.unitPrice) * item.quantity !== total
    )
      throw new Error("Цена и количество не совпадают с суммой строки");
    // FNS layouts without a quantity field get one line for each unit. No float rounding.
    for (let i = 0; i < item.quantity; i++)
      rows.push({
        name: item.name,
        kopecks:
          Math.floor(total / item.quantity) +
          (i < total % item.quantity ? 1 : 0),
      });
  }
  if (rows.length > 100)
    throw new Error("В чеке больше 100 строк; требуется продавец");
  const total = kopecks(job.amount);
  if (total <= 0 || rows.reduce((s, r) => s + r.kopecks, 0) !== total)
    throw new Error("Состав не совпадает с итогом продажи");
  return {
    version: 1,
    buyer: "individual",
    date: `${parts.year}-${parts.month}-${parts.day}`,
    rows,
    total,
  };
}
export async function planDigest(plan) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(plan)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function receiptLink(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname === "lknpd.nalog.ru" &&
      !u.port &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      /^\/api\/v1\/receipt\/\d{12}\/[a-zA-Z0-9-]+\/print\/?$/.test(u.pathname)
    );
  } catch {
    return false;
  }
}
export function recoveryDecision(phase) {
  return ["fencing", "fenced", "clicking", "submitted", "uncertain"].includes(
    phase,
  )
    ? "reconcile"
    : phase === "result_pending"
      ? "resend_result"
      : "stop_before_submission";
}
