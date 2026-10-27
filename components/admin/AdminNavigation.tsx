"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  ["", "Требует внимания"],
  ["orders", "Заказы"],
  ["production", "Изготовление"],
  ["customers", "Покупатели"],
  ["finance", "Финансы"],
  ["inventory", "Склад"],
  ["checkout-errors", "Ошибки оформления"],
  ["campaigns", "Рассылки"],
  ["analytics", "Воронка"],
  ["carts", "Незавершённые корзины"],
  ["products", "Товары"],
  ["messages", "Сообщения"],
  ["reviews", "Отзывы"],
  ["waitlist", "Заявки на поступление"],
  ["garden-requests", "Выбор Сада"],
  ["site", "Сайт"],
  ["delivery", "Доставка"],
] as const;

export default function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav
      className="flex flex-wrap gap-2 mb-8 border-b border-stone-200 pb-4"
      aria-label="Админка"
    >
      {sections.map(([path, label]) => {
        const href = path ? `/admin/${path}` : "/admin";
        const active = pathname === href || (Boolean(path) && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={path}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`admin-secondary ${active ? "border-stone-900 bg-stone-100 font-medium" : "hover:border-stone-500"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
