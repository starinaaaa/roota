"use server";
import { getAuth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
export async function logout() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/admin/login");
}
