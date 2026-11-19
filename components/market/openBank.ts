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
// Reserve the tab during the buyer's tap, before waiting for the signed form.
export function openPaymentTab() {
  const tab = window.open("about:blank", "_blank");
  if (tab) {
    tab.document.title = "Оплата Roota";
    tab.document.body.textContent = "Открываем Робокассу…";
  }
  return tab;
}

export function openBank(form: PaymentForm, path: string, tab: Window | null) {
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
  if (!tab) window.history.replaceState(null, "", path + "?return=success");
  if (tab?.closed) throw new Error("Окно оплаты закрыто. Попробуйте ещё раз.");
  const page = tab ? tab.document : document;
  const element = page.createElement("form");
  element.method = "POST";
  element.action = form.action;
  for (const [name, value] of Object.entries(form.fields)) {
    const input = page.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    element.appendChild(input);
  }
  page.body.appendChild(element);
  element.submit();
  if (!tab) return;

  let timer: number;
  let checking = false;
  let finished = false;
  function stop() {
    finished = true;
    window.clearTimeout(timer);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", check);
  }
  async function check() {
    if (finished || checking) return;
    checking = true;
    window.clearTimeout(timer);
    try {
      const response = await fetch("/api" + path, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (response.ok && (await response.json()).status === "paid") {
        stop();
        const success = path + "?return=success";
        try {
          if (tab && !tab.closed) tab.close();
        } finally {
          window.location.replace(success);
        }
        return;
      }
      if (tab?.closed) {
        stop();
        window.location.replace(path);
        return;
      }
    } catch {
      // Check again when the connection to the shop resumes.
    } finally {
      checking = false;
      if (!finished) timer = window.setTimeout(check, 1500);
    }
  }
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  void check();
}
