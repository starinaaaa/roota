import type { PaymentForm } from "@robokassa/sdk";
export function openBank(form: PaymentForm) {
  const target = new URL(form.action);
  if (target.origin !== "https://auth.robokassa.ru")
    throw new Error("Не удалось открыть оплату");
  const element = document.createElement("form");
  element.method = "POST";
  element.action = form.action;
  for (const [name, value] of Object.entries(form.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    element.appendChild(input);
  }
  document.body.appendChild(element);
  element.submit();
}
