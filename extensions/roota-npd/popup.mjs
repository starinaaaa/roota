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
  el("error").textContent = s.lastError ?? "";
  el("arm").disabled = !s.liveCertified || !s.connected;
  el("preview").disabled = !s.connected;
}
function bind(id, action, args = () => ({})) {
  el(id).addEventListener("click", async () => {
    el("error").textContent = "";
    for (const b of document.querySelectorAll("button")) b.disabled = true;
    try {
      if (id === "clear" && !el("draft-closed").checked)
        throw Error("Сначала закройте черновик ФНС без выдачи чека");
      await send(action, args());
      if (id === "connect") el("credential").value = "";
      await refresh();
    } catch (e) {
      el("error").textContent = e.message;
    } finally {
      for (const b of document.querySelectorAll("button")) b.disabled = false;
      const s = await send("state");
      el("arm").disabled = !s.liveCertified || !s.connected;
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
refresh().catch((e) => (el("error").textContent = e.message));
