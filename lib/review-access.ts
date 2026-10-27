import { createHmac, timingSafeEqual } from "node:crypto";
export const reviewCookie = "__Host-roota-review";
export function reviewAccessToken(secret: string, host: string) {
  return createHmac("sha256", secret)
    .update(`roota-private-review-v1:${host}`)
    .digest("hex");
}
export function validReviewToken(
  value: string | undefined,
  secret: string | undefined,
  host: string,
) {
  if (!secret || secret.length < 32 || !value || !/^[a-f0-9]{64}$/.test(value))
    return false;
  return timingSafeEqual(
    Buffer.from(value),
    Buffer.from(reviewAccessToken(secret, host)),
  );
}
export function reviewAllowsRequest(method: string, path: string) {
  if (
    /^\/api\/cron(?:\/|$)/.test(path) ||
    /^\/(?:api\/)?payments?(?:\/|$)/.test(path) ||
    /^\/order\/[^/]+\/pay(?:\/|$)/.test(path)
  )
    return false;
  if (method === "GET" || method === "HEAD") return true;
  return (
    method === "POST" &&
    [
      "/api/auth/sign-in/email",
      "/api/auth/sign-out",
      "/api/auth/get-session",
    ].includes(path)
  );
}
