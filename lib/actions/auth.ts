"use server";
import { createAuthClient, allowedAdminEmail } from "@/lib/auth";
import { redirect } from "next/navigation";
import { z } from "zod";
export async function login(_previous: { error: string }, form: FormData) {
  const data = z
    .object({ email: z.string().email(), password: z.string().min(1).max(200) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  const failure = {
    error: "Не удалось войти. Проверьте данные и доступ к админке.",
  };
  if (!data.success || !allowedAdminEmail(data.data.email)) return failure;
  try {
    const client = await createAuthClient();
    const { data: result, error } = await client.auth.signInWithPassword(
      data.data,
    );
    if (error || !result.user?.email_confirmed_at) {
      await client.auth.signOut();
      return failure;
    }
  } catch {
    return failure;
  }
  redirect("/admin/orders");
}
export async function logout() {
  const client = await createAuthClient();
  await client.auth.signOut();
  redirect("/admin/login");
}
