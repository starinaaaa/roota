import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import LoginForm from "@/components/admin/LoginForm";
export default async function LoginPage() {
  if (await getAdmin()) redirect("/admin/orders");
  return <LoginForm />;
}
