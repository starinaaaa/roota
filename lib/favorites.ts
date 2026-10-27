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
