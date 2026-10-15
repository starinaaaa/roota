export function emailProviderKey(
  kind: string,
  env: Record<string, string | undefined>,
) {
  // Order updates and voluntary subscriptions can use isolated provider projects.
  // Once either project is configured, never cross back to the shared account.
  // A missing project key must fail closed instead of mixing the two audiences.
  if (
    env.UNISENDER_GO_SERVICE_API_KEY &&
    env.UNISENDER_GO_SERVICE_API_KEY === env.UNISENDER_GO_MARKETING_API_KEY
  )
    return undefined;
  const projectKey = kind.startsWith("order_")
    ? env.UNISENDER_GO_SERVICE_API_KEY
    : env.UNISENDER_GO_MARKETING_API_KEY;
  return env.UNISENDER_GO_SERVICE_API_KEY || env.UNISENDER_GO_MARKETING_API_KEY
    ? projectKey
    : env.UNISENDER_GO_API_KEY;
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
