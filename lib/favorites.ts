import { z } from "zod";
import { gardenConfigurationSchema, gardenKey } from "./garden";
export const favoriteItemSchema = z.object({
  productId: z.uuid(),
  configuration: gardenConfigurationSchema.nullable().default(null),
});
export const selectionSchema = z.array(favoriteItemSchema).min(1).max(50);
export type FavoriteItem = z.infer<typeof favoriteItemSchema>;
export function favoriteKey(item: FavoriteItem) {
  return `${item.productId}:${item.configuration ? gardenKey(item.configuration) : "plain"}`;
}
export const favoritesStorageKey = "roota:favorites:v1";

// The link carries only published product IDs and a Garden composition, never customer data.
export function encodeSelection(items: FavoriteItem[]) {
  return encodeURIComponent(JSON.stringify(selectionSchema.parse(items)));
}
export function decodeSelection(
  value: string | undefined,
): FavoriteItem[] | null {
  if (!value || value.length > 16000) return null;
  try {
    const parsed = selectionSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
