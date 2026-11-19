import type { PaymentForm } from "@robokassa/sdk";
export function recentMarketPayment(id?: string): string | null {
  try {
    const previous = JSON.parse(
      sessionStorage.getItem("roota-market-return") || "null",
    );
    if (
      previous &&
      (!id || previous.id === id) &&
      Date.now() < previous.until &&
      /^\/market\/pay\/[a-f0-9]{64}$/.test(previous.path)
    )
      return previous.path;
  } catch {
    /* Storage can be unavailable in private browsers. */
  }
  return null;
}
export function openBank(form: PaymentForm, path: string) {
  const target = new URL(form.action);
  if (target.origin !== "https://auth.robokassa.ru")
    throw new Error("Не удалось открыть оплату");
  if (!/^\/market\/pay\/[a-f0-9]{64}$/.test(path))
    throw new Error("Не найдена страница покупки");
  try {
    sessionStorage.setItem(
      "roota-market-return",
      JSON.stringify({
        path,
        id: form.fields.Shp_payment,
        until: Date.now() + 86400000,
      }),
    );
  } catch {
    /* The provider still has the explicit return URL. */
  }
  window.history.replaceState(null, "", path + "?return=success");
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
