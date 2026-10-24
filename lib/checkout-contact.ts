import { z } from "zod";
import { checkoutDeliveryDraft } from "./checkout-draft";

// Intentionally accept incomplete contact values: this is a draft, not an order.
export const checkoutContactData = z
  .object({
    firstName: z.string().max(50),
    lastName: z.string().max(50),
    phone: z.string().max(40),
    email: z.string().max(254),
    telegram: z.string().max(33),
    address: z.string().max(500),
    comment: z.string().max(2000),
    deliveryMethod: z.enum(["ozon_point", "yandex_courier"]),
    delivery: checkoutDeliveryDraft.nullable(),
  })
  .strict();
export type CheckoutContactData = z.infer<typeof checkoutContactData>;
export const checkoutContactInput = z
  .object({
    capturedAt: z.number().int().positive(),
    data: checkoutContactData,
  })
  .strict();
export function hasCheckoutContact(data: CheckoutContactData) {
  return (
    [
      data.firstName,
      data.lastName,
      data.phone.replace(/^\+7\s*$/, ""),
      data.email,
      data.telegram,
      data.address,
      data.comment,
    ].some((value) => value.trim()) ||
    Boolean(data.delivery?.city || data.delivery?.point)
  );
}
export const saveCheckoutContactSql = `
insert into public.checkout_contact_drafts(cart_id,data,captured_at,expires_at)
select c.id,$2::jsonb,to_timestamp($3::double precision/1000),now()+interval '7 days'
from public.carts c where c.session_id=$1
 and ($4::boolean or exists(select 1 from public.checkout_contact_drafts d where d.cart_id=c.id))
 and exists(select 1 from public.cart_items i where i.cart_id=c.id)
 and not exists(select 1 from public.orders o where o.cart_session=c.session_id and o.created_at>=to_timestamp($3::double precision/1000))
on conflict(cart_id) do update set data=excluded.data,captured_at=excluded.captured_at,
 updated_at=now(),expires_at=excluded.expires_at
where excluded.captured_at>=checkout_contact_drafts.captured_at
`;
