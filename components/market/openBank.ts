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
type BankWidget = {
  StartPayment(fields: PaymentForm["fields"], callbacks: {
    onComplete(result: { status: string; paymentStarted?: boolean }): void;
  }): void;
};
let widgetPromise: Promise<BankWidget> | undefined;
function loadWidget() {
  if (!widgetPromise) {
    widgetPromise = new Promise<BankWidget>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://auth.robokassa.ru/Merchant/bundle/robokassa_iframe.js";
      script.onload = () => {
        const widget = (window as Window & { Robokassa?: BankWidget }).Robokassa;
        if (widget?.StartPayment) resolve(widget);
        else reject(new Error("Не удалось открыть форму Робокассы"));
      };
      script.onerror = () => reject(new Error("Не удалось загрузить Робокассу"));
      document.head.appendChild(script);
    }).catch((error) => {
      widgetPromise = undefined;
      throw error;
    });
  }
  return widgetPromise;
}

export async function openBank(form: PaymentForm, path: string) {
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
  let widget: BankWidget | undefined;
  try {
    widget = await loadWidget();
  } catch {
    // Keep the hosted checkout available when the widget script is blocked.
  }
  if (widget) {
    let finished = false;
    let timer: number;
    function finish(returning: boolean) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      window.location.replace(returning ? path + "?return=success" : path);
    }
    async function checkPayment() {
      try {
        const response = await fetch("/api" + path, { cache: "no-store" });
        if (response.ok && (await response.json()).status === "paid") {
          finish(true);
          return;
        }
      } catch {
        // A bank app can suspend Safari or temporarily interrupt its connection.
      }
      if (!finished) timer = window.setTimeout(checkPayment, 2500);
    }
    widget.StartPayment({ ...form.fields }, {
      onComplete: ({ status, paymentStarted }) =>
        finish(status === "success" || (status === "close" && !!paymentStarted)),
    });
    if (!finished) timer = window.setTimeout(checkPayment, 2500);
    return;
  }
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
