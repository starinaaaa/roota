import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { getPool } from "./db/pool";
import { authOptions } from "./auth-config";
const makeAuth = () => betterAuth({ ...authOptions(getPool()), plugins: [nextCookies()] });
let instance: ReturnType<typeof makeAuth> | undefined;
export function getAuth() {
  return instance ??= makeAuth();
}
export function allowedAdminEmail(email?: string) {
  const allowed = (process.env.ADMIN_EMAILS ?? "").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}
export async function getAdmin() {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) return null;
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (!session?.user.emailVerified || !allowedAdminEmail(session.user.email)) return null;
    return { id: session.user.id, email: session.user.email };
  } catch { return null; }
}
export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) throw new Error("Доступ запрещён");
  return admin;
}
