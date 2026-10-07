import type { Metadata } from "next";
import Link from "next/link";
import OrderSuccessClient from "./OrderSuccessClient";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";

export const metadata: Metadata = {
  title: "Заказ принят",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ id?: string }>;
};

export default async function OrderSuccessPage({ searchParams }: Props) {
  const params = await searchParams;
  const orderId = params.id ?? "";
  const session = (await cookies()).get("cart_session")?.value;
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(session).success)
    notFound();
  const { data: order, error } = await createServerClient()
    .from("orders")
    .select("order_number")
    .eq("id", orderId)
    .eq("cart_session", session)
    .maybeSingle();
  if (error || !order) notFound();
  const shortId = order.order_number;

  return (
    <div className="pt-16 md:pt-20 min-h-screen flex items-center">
      <div className="max-w-[1440px] w-full mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-32">
        <div className="max-w-md">
          {/* Анимированная галочка */}
          <OrderSuccessClient />

          {/* Текст */}
          <div className="space-y-4 mt-10">
            {shortId && (
              <p className="font-body text-caption tracking-[0.08em] uppercase text-stone-600">
                Заказ #{shortId}
              </p>
            )}
            <h1 className="font-display text-page leading-tight text-stone-900">
              Заказ принят
            </h1>
            <p className="font-body text-copy text-stone-800 leading-relaxed">
              Мы свяжемся с вами в течение 24 часов для подтверждения заказа
              и уточнения деталей доставки.
            </p>
            <p className="font-body text-copy text-stone-600">
              Спасибо, что выбираете Roota ceramics.
            </p>
          </div>

          {/* Действия */}
          <div className="flex flex-col sm:flex-row gap-3 mt-12">
            <Link
              href="/catalog"
              className="
                font-body text-ui tracking-[0.08em] uppercase
                bg-stone-900 text-stone-50
                px-8 py-4 text-center
                hover:bg-stone-700 transition-colors duration-300
              "
            >
              Продолжить покупки
            </Link>
            <Link
              href="/"
              className="
                font-body text-ui tracking-[0.08em] uppercase
                border border-stone-200 text-stone-600
                px-8 py-4 text-center
                hover:border-stone-400 hover:text-stone-900 transition-all duration-300
              "
            >
              На главную
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
