import type { BetterAuthOptions } from "better-auth";
import type { Pool } from "pg";
export function authOptions(pool: Pool): BetterAuthOptions {
  const baseURL = process.env.BETTER_AUTH_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!baseURL || !secret || secret.length < 32) throw new Error("AUTH_NOT_CONFIGURED");
  return {
    database: pool, baseURL, secret,
    // Never include submitted credentials, tokens, or database errors in logs.
    logger: { level: "warn", log(level) { console.warn("admin_auth", { level }); } },
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
    advanced: {
      database: { generateId: "uuid" },
      defaultCookieAttributes: { httpOnly: true, secure: new URL(baseURL).protocol === "https:", sameSite: "lax" },
    },
    // No cookie cache: revocation is checked for every protected request.
    session: { modelName: "admin_session", expiresIn: 60 * 60 * 8, updateAge: 60 * 30 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30,
      customRules: { "/sign-in/email": { window: 60, max: 5 } } },
    user: { modelName: "admin_user" },
    account: { modelName: "admin_account" },
    verification: { modelName: "admin_verification" },
    telemetry: { enabled: false },
  };
}
