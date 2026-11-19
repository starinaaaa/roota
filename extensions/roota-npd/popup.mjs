import { receiptLink } from "./core.mjs";
const el = (id) => document.getElementById(id);
const labels = {
  claimed: "Задача получена",
  filling: "Заполнение",
  filled: "Форма сверена",
  preview_ready: "Проверено. Доход НЕ зарегистрирован",
  fencing: "Отправка могла начаться — нужна сверка",
  fenced: "Отправка разрешена — нужна сверка",
  clicking: "Выдача могла состояться — нужна сверка",
  submitted: "Ожидание результата ФНС",
  result_pending: "Чек найден; сохранение результата",
  uncertain: "Результат требует проверки",
  error: "Ошибка — выдача остановлена",
  completed: "Оригинальный чек сохранён в Roota",
  cleared: "Проверка закрыта",
};
async function send(action, extra = {}) {
  const r = await chrome.runtime.sendMessage({ action, ...extra });
  if (!r?.ok) throw Error(r?.error ?? "Служебный процесс недоступен");
  return r.result;
}
let connectionState;
let working = false;
async function refresh() {
  const s = await send("state");
  el("extension-id").textContent = s.id;
  el("status").textContent = s.connected
    ? "Подключён к Roota · " +
      (s.armed && s.liveCertified
        ? "рабочий режим включён"
        : "безопасный режим") +
      (s.active ? " · " + (labels[s.active.phase] ?? s.active.phase) : "")
    : "Не подключён";
  el("sales-mode").value = s.previewMode ?? "test";
  el("inspection").textContent = s.lastInspection?.confirmed
    ? `Результат ФНС проверен: ${s.lastInspection.saleNumber}, ${(s.lastInspection.total / 100).toFixed(2)} ₽. Нового дохода не создано.`
    : "";
  el("task").textContent = s.active
    ? `Покупка${s.active.job.inv_id ? " М-" + String(s.active.job.inv_id).slice(-6) : ""} · ${labels[s.active.phase] ?? s.active.phase}`
    : "";
  const found = s.active?.evidence?.url;
  el("found-receipt").hidden = !receiptLink(found ?? "");
  if (receiptLink(found ?? "")) el("found-receipt").href = found;
  el("error").textContent = s.active?.phase === "uncertain"
    ? (s.active.detail || "Результат выдачи неизвестен.") + " Проверьте историю в Моем налоге перед новой выдачей."
    : s.lastError || (s.active?.phase === "error" && s.active.detail) || "";
  if (connectionState !== s.connected) {
    el("connection").open = !s.connected;
    connectionState = s.connected;
  }
  el("arm").hidden = !s.connected || s.armed;
  el("pause").hidden = !s.armed;
  el("recover").hidden = !s.active || ["completed","cleared"].includes(s.active.phase);
  el("arm").disabled = !s.liveCertified || !s.connected;
  el("preview").disabled = !s.connected;
}
function bind(id, action, args = () => ({})) {
  el(id).addEventListener("click", async () => {
    working = true;
    el("error").textContent = "";
    for (const b of document.querySelectorAll("button")) b.disabled = true;
    try {
      if (id === "clear" && !el("draft-closed").checked)
        throw Error("Сначала закройте черновик ФНС без выдачи чека");
      await send(action, args());
      if (id === "connect") el("credential").value = "";
      await refresh();
    } catch (e) {
      await refresh().catch(() => {});
      el("error").textContent = e.message;
      el("error").focus();
    } finally {
      for (const b of document.querySelectorAll("button")) b.disabled = false;
      working = false;
      const s = await send("state").catch(() => null);
      el("arm").disabled = !s?.liveCertified || !s?.connected;
      el("preview").disabled = !s?.connected;
    }
  });
}
bind("connect", "connect", () => ({
  credential: el("credential").value.trim(),
}));
bind("disconnect", "disconnect");
bind("preview", "preview", () => ({ mode: el("sales-mode").value }));
bind("recover", "recover");
bind("inspect", "inspect");
bind("clear", "clear");
bind("arm", "arm");
bind("pause", "pause");
chrome.storage.onChanged.addListener((changes, area) => {
  if (!working && area === "local" && ["active","armed","lastError","reportedStatus"].some(key => key in changes)) {
    refresh().catch(e => { el("error").textContent = e.message; });
  }
});
refresh().catch((e) => (el("error").textContent = e.message));
