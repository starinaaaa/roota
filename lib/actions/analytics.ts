"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import {
  excludeAnalyticsSession,
  exclusionCookie,
} from "@/lib/analytics/exclusion";

export async function excludeMyAnalytics() {
  await requireAdmin();
  const jar = await cookies();
  const existing = jar.get("cart_session")?.value;
  const session = uuid.safeParse(existing).success ? existing! : randomUUID();
  try {
    await excludeAnalyticsSession(session);
  } catch {
    return { error: "Не удалось исключить браузер. Попробуйте ещё раз." };
  }
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  if (session !== existing)
    jar.set("cart_session", session, { ...options, maxAge: 60 * 60 * 24 * 30 });
  jar.set(exclusionCookie, "1", { ...options, maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/admin/analytics");
  return { error: "" };
}
