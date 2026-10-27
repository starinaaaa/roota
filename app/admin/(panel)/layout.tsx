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
        {process.env.ROOTA_REVIEW_HOST ? <><p className="mb-5 rounded border border-stone-300 p-4 text-sm">Только просмотр. Журналы и редактирование новых разделов будут включены после одобрения миграции. Данные читаются из рабочего магазина.</p><fieldset disabled className="min-w-0">{children}</fieldset></> : children}
      </div>
    </div>
  );
}
