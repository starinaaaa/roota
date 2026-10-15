export const funnelPagePattern =
  /^\/(?:catalog|checkout|product\/[a-zA-Z0-9_-]+)?$/;
export function campaignValue(value: string | null) {
  return (value ?? "").replace(/[^\p{L}\p{N}_. -]/gu, "").slice(0, 80);
}
