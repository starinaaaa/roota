import type { Product } from "@/types";
// Attribute contract published by the official Ohmywishes button generator.
// Mount the vendor widget only after enabling the integration in deployment.
export function ohmywishesAttributes(
  product: Pick<
    Product,
    "name" | "description" | "price" | "primary_image_url"
  >,
) {
  return {
    className: "omw_button_spot",
    "data-title_kind": "omwru",
    "data-size": "medium",
    "data-color": "white",
    "data-logo": "true",
    "data-type": "button",
    "data-radius": "8",
    "data-language": "ru",
    "data-title": product.name,
    "data-description": product.description,
    "data-image": product.primary_image_url ?? "",
    "data-price": String(product.price),
    "data-currency": "RUB",
  };
}
