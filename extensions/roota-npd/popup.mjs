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
    ? "Подключён к Roota · " + (labels[s.active?.phase] ?? "безопасный режим")
    : "Не подключён";
  el("task").textContent = s.active
    ? `Продажа ${s.active.job.sale_id} · ${labels[s.active.phase] ?? s.active.phase}`
    : "";
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
bind("clear", "clear");
bind("arm", "arm");
bind("pause", "pause");
refresh().catch((e) => (el("error").textContent = e.message));
