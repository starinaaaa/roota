import { z } from "zod";
const id = z.uuid();
export const addressSuggestionInput = z.object({
  part: z.enum(["city", "street", "house"]),
  query: z.string().trim().min(1).max(100),
  parent: z
    .object({
      region_fias_id: id.optional(),
      city_fias_id: id.optional(),
      settlement_fias_id: id.optional(),
      street_fias_id: id.optional(),
    })
    .optional(),
});
export type AddressLocation = NonNullable<
  z.infer<typeof addressSuggestionInput>["parent"]
>;
export type AddressSuggestion = { value: string; location: AddressLocation };
export async function suggestAddresses(
  input: z.infer<typeof addressSuggestionInput>,
  key: string,
  fetcher = fetch,
): Promise<AddressSuggestion[]> {
  if (input.part === "house" && !input.parent?.street_fias_id) return [];
  if (
    input.part === "street" &&
    !input.parent?.region_fias_id &&
    !input.parent?.city_fias_id &&
    !input.parent?.settlement_fias_id
  )
    return [];
  const response = await fetcher(
    "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${key}`,
      },
      body: JSON.stringify({
        query: input.query,
        count: input.part === "house" ? 20 : 8,
        from_bound: { value: input.part },
        to_bound: { value: input.part },
        ...(input.parent ? { locations: [input.parent] } : {}),
      }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new Error("ADDRESS_PROVIDER_UNAVAILABLE");
  const result = z
    .object({
      suggestions: z.array(
        z.object({
          value: z.string().max(500),
          data: z.object({
            region_fias_id: id.nullish(),
            city_fias_id: id.nullish(),
            settlement_fias_id: id.nullish(),
            street_fias_id: id.nullish(),
            house_fias_id: id.nullish(),
            house: z.string().nullish(),
          }),
        }),
      ),
    })
    .parse(await response.json());
  return result.suggestions
    .filter(
      (s) =>
        input.part !== "house" ||
        (s.data.house_fias_id &&
          (!/^\d+$/.test(input.query) ||
            !s.data.house ||
            s.data.house.startsWith(input.query))),
    )
    .map((s) => ({
      value: s.value,
      location: Object.fromEntries(
        Object.entries(s.data).filter(([k, v]) => ["region_fias_id", "city_fias_id", "settlement_fias_id", "street_fias_id"].includes(k) && v),
      ) as AddressLocation,
    }));
}
