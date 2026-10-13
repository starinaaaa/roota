// Public hero images only; the route checks the currently published image
// before consulting this cache. Failed requests are never cached.
export function createSiteImageCache(
  ttl = 300_000,
  limit = 16,
  now = Date.now,
  timeout = 15_000,
) {
  const entries = new Map<string, { expires: number; image: Promise<Blob> }>();
  return async (key: string, load: () => Promise<Blob>): Promise<Blob> => {
    const cached = entries.get(key);
    if (cached && cached.expires > now()) return cached.image;
    const entry = {
      expires: Number.POSITIVE_INFINITY,
      image: (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            Promise.resolve().then(load),
            new Promise<Blob>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("SITE_IMAGE_TIMEOUT")),
                timeout,
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      })(),
    };
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > limit) entries.delete(entries.keys().next().value!);
    try {
      const image = await entry.image;
      entry.expires = now() + ttl;
      return image;
    } catch (error) {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    }
  };
}

export const cachedSiteImage = createSiteImageCache();
