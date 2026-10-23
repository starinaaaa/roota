import { uuid } from "@/lib/validation";

type Params = Record<string, string | string[] | undefined>;
const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;
export function parseAnalyticsFilters(params: Params) {
  const daysInput = Number(single(params.days));
  const days = [7, 30, 90].includes(daysInput) ? daysInput : 30;
  const raw = params.product;
  const products = [...new Set(Array.isArray(raw) ? raw : raw ? [raw] : [])];
  if (products.some((id) => !uuid.safeParse(id).success))
    throw new Error("INVALID_PRODUCT");
  if (Array.isArray(params.start) || Array.isArray(params.end))
    throw new Error("INVALID_PERIOD");
  const start = single(params.start) ?? "";
  const end = single(params.end) ?? "";
  const validDate = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  if ((start || end) && (!validDate(start) || !validDate(end) || start > end))
    throw new Error("INVALID_PERIOD");
  return { days, products, start, end };
}
