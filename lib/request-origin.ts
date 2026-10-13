// Use the configured public URL when a reverse proxy rewrites the internal URL.
// Forwarded headers are deliberately not trusted as an origin allowlist.
export function isTrustedRequestOrigin(
  request: Pick<Request, "headers" | "url">,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    const expected = new URL(siteUrl || request.url);
    if (!["http:", "https:"].includes(expected.protocol)) return false;
    return origin === expected.origin;
  } catch {
    return false;
  }
}
