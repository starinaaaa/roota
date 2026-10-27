// Keep the prepared wishlist and Ohmywishes code available for a later release.
export const shopFeatures = { wishlist: false, ohmywishes: false } as const;
export function hiddenShopPath(path: string) {
  return (
    (!shopFeatures.wishlist &&
      ["/favorites", "/selection"].some(
        (prefix) => path === prefix || path.startsWith(prefix + "/"),
      )) ||
    (!shopFeatures.ohmywishes &&
      (path === "/api/catalog/ohmywishes" ||
        path.startsWith("/api/catalog/ohmywishes/")))
  );
}
