// Public seller details supplied by the owner. No payment credentials belong here.
export const seller = {
  name: "Маточкин Никита Романович",
  inn: "110208421550",
  city: "Москва",
  phone: "+7 912 553-51-30",
  phoneHref: "tel:+79125535130",
  site: "https://roota-liart.vercel.app",
} as const;

export function sellerDetails(email: string) {
  return `Самозанятый ${seller.name}\nИНН: ${seller.inn}\nГород: ${seller.city}\nЭлектронная почта: ${email}\nТелефон: ${seller.phone}`;
}
