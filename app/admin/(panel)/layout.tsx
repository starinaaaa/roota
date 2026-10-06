import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return (
    <div className="pt-28 pb-16 px-4 md:px-10 max-w-[1440px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl">Студия · управление</h1>
        <form action={logout}>
          <button className="admin-secondary">Выйти</button>
        </form>
      </div>
      <nav
        className="flex gap-2 mb-8 border-b border-stone-200 pb-4 overflow-x-auto"
        aria-label="Админка"
      >
        {[
          ["orders", "Заказы"],
          ["products", "Товары"],
          ["site", "Сайт"],
          ["delivery", "Доставка"],
        ].map(([path, label]) => (
          <Link className="admin-secondary" key={path} href={"/admin/" + path}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
