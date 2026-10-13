export function emailProviderKey(
  kind: string,
  env: Record<string, string | undefined>,
) {
  // Order updates and voluntary subscriptions can use isolated provider projects.
  // The existing account key remains the fallback until support enables projects.
  return (
    (kind.startsWith("order_")
      ? env.UNISENDER_GO_SERVICE_API_KEY
      : env.UNISENDER_GO_MARKETING_API_KEY) || env.UNISENDER_GO_API_KEY
  );
}
export function emailWebhookKeys(env: Record<string, string | undefined>) {
  return [
    ...new Set(
      [
        env.UNISENDER_GO_API_KEY,
        env.UNISENDER_GO_SERVICE_API_KEY,
        env.UNISENDER_GO_MARKETING_API_KEY,
      ].filter((key): key is string => Boolean(key)),
    ),
  ];
}
