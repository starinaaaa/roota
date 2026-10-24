import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getPool } from "@/lib/db/pool";
import { allowedAdminEmail } from "@/lib/auth";
import { authOptions } from "@/lib/auth-config";
import { normalizeName } from "./model";

const makeAuth = () => {
  const options = authOptions(getPool());
  return betterAuth({
    ...options,
    appName: "Рулетка дел",
    basePath: "/wheel/auth",
    emailAndPassword: {
      ...options.emailAndPassword,
      enabled: true,
      disableSignUp: false,
    },
    advanced: {
      ...options.advanced,
      cookiePrefix: "roota-wheel",
      defaultCookieAttributes: {
        ...options.advanced?.defaultCookieAttributes,
        path: "/wheel",
      },
    },
    user: { modelName: "wheel_user" },
    account: { modelName: "wheel_account" },
    session: {
      modelName: "wheel_session",
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    verification: { modelName: "wheel_verification" },
    rateLimit: { ...options.rateLimit, modelName: "wheel_rate_limit" },
    plugins: [nextCookies()],
  });
};
let instance: ReturnType<typeof makeAuth> | undefined;
export function getWheelAuth() {
  return (instance ??= makeAuth());
}
const makeOwnerAuth = () => {
  const options = authOptions(getPool());
  return betterAuth({
    ...options,
    basePath: "/wheel/owner-auth",
    advanced: {
      ...options.advanced,
      cookiePrefix: "roota-wheel-owner",
      defaultCookieAttributes: {
        ...options.advanced?.defaultCookieAttributes,
        path: "/wheel",
      },
    },
    plugins: [nextCookies()],
  });
};
let ownerInstance: ReturnType<typeof makeOwnerAuth> | undefined;
export function getWheelOwnerAuth() {
  return (ownerInstance ??= makeOwnerAuth());
}
export function nameEmail(name: string) {
  return (
    createHash("sha256").update(normalizeName(name)).digest("hex") +
    "@wheel.invalid"
  );
}
export async function wheelIdentity() {
  const owner = await getWheelOwnerAuth().api.getSession({
    headers: await headers(),
  });
  if (owner?.user.emailVerified && allowedAdminEmail(owner.user.email))
    return {
      id: owner.user.id,
      name: owner.user.name || "Владелец",
      owner: true,
    };
  const session = await getWheelAuth().api.getSession({
    headers: await headers(),
  });
  return session
    ? { id: session.user.id, name: session.user.name, owner: false }
    : null;
}
