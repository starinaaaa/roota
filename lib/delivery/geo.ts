export type DeliveryCity = {
  name: string;
  latitude: number;
  longitude: number;
};
export const majorCities: DeliveryCity[] = [
  { name: "Москва", latitude: 55.7558, longitude: 37.6176 },
  { name: "Санкт-Петербург", latitude: 59.9386, longitude: 30.3141 },
];
export function normalizeCity(value: string) {
  const s = value
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/^г(?:ород)?\.?\s+/, "");
  return /^(спб|питер|санкт петербург)$/.test(s) ? "санкт-петербург" : s;
}
export function addressCity(address: string): string | null {
  const parts = address.split(",").map((p) => p.trim());
  for (const p of parts) {
    const known = majorCities.find(
      (c) => normalizeCity(c.name) === normalizeCity(p),
    );
    if (known) return known.name;
    if (/^(?:г(?:ород)?|пгт|пос(?:елок)?|село|деревня)\.?\s+/i.test(p))
      return p.replace(
        /^(?:г(?:ород)?|пгт|пос(?:елок)?|село|деревня)\.?\s+/i,
        "",
      );
  }
  // Unprefixed addresses: skip country, postcode and administrative regions.
  return (
    parts.find(
      (p) =>
        /[а-я]/i.test(p) &&
        !/россия|республика|область|обл\.|район|край|округ|улица|ул\.|проспект|пр-т|шоссе|переулок|дом|^д\./i.test(
          p,
        ),
    ) ?? null
  );
}
export function coordinates(
  value: unknown,
): { latitude: number; longitude: number } | undefined {
  if (!value || typeof value !== "object") return;
  const { latitude, longitude } = value as Record<string, unknown>;
  if (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    (latitude !== 0 || longitude !== 0)
  )
    return { latitude, longitude };
}
