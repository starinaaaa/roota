import { cookies } from "next/headers";
import type { Metadata } from "next";
import { ozonConfigured } from "@/lib/delivery/ozon";
import CheckoutForm from "@/components/checkout/CheckoutForm";
import { getCart } from "@/lib/actions/cart";

export const metadata: Metadata = {
  title: "Оформление заказа",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const { items } = await getCart();
  const draftKey = (await cookies()).get("cart_session")?.value ?? "guest";
  return (
    <div className="pt-16 md:pt-20 min-h-screen">
      <CheckoutForm
        key={draftKey}
        initialItems={items}
        deliveryEnabled={ozonConfigured()}
        draftKey={draftKey}
      />
    </div>
  );
}
