import SubmitButton from "@/components/ui/SubmitButton";
import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import AdminNavigation from "@/components/admin/AdminNavigation";
export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return (
    <div className="admin-panel pt-28 pb-16 px-6 md:px-12 lg:px-16">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <h1 className="text-2xl">Студия · управление</h1>
          <form action={logout}>
            <SubmitButton className="admin-secondary">Выйти</SubmitButton>
          </form>
        </div>
        <AdminNavigation />
        {children}
      </div>
    </div>
  );
}
