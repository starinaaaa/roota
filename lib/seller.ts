// Public seller details supplied by the owner.
export const seller = {
  name: "Равнушкина Дарья Евгеньевна",
  inn: "773212983545",
  city: "Москва",
  site: "https://roota-liart.vercel.app",
} as const;

export function sellerDetails(email: string) {
  return `Самозанятая ${seller.name}\nИНН: ${seller.inn}\nГород: ${seller.city}\nЭлектронная почта: ${email}`;
}
