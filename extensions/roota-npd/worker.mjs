import { config } from "./config.mjs";
import { createController } from "./controller.mjs";
import { fnsTask } from "./fns-adapter.mjs";
const local = chrome.storage.local;
const load = () => local.get(null);
async function api(body, credentialOverride) {
  if (body.action === "heartbeat")
    await local.set({
      reportedStatus: body.status,
      reportedDetail: body.detail ?? null,
    });
  const { credential: storedCredential } = await load();
  const credential = credentialOverride ?? storedCredential;
  if (!credential)
    throw Error("Вставьте отдельный ключ из управления маркетом");
  const response = await fetch(config.roota + "/api/market/helper", {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credential}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(
      ["result", "inspect"].includes(body.action) ? 28000 : 12000,
    ),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? "Roota не ответила");
  return data;
}
async function call(tabId, action, plan) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith(config.fns + "/"))
    throw Error("Исходная вкладка ФНС закрыта или адрес изменился");
  const state = await load();
  if (["result", "inspect"].includes(action))
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["vendor/jsQR.js"],
    });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: fnsTask,
    args: [
      {
        action,
        plan,
        safe: state.active?.safe !== false,
        liveCertified: config.liveCertified,
        submissionKey: state.active
          ? `${state.active.job.sale_id}:${state.active.digest}:${state.active.job.claim_token}`
          : null,
      },
    ],
  });
  if (!result?.ok) {
    const e = new Error(result?.error ?? "Форма ФНС недоступна");
    e.code = result?.code;
    throw e;
  }
  return result;
}
const controller = createController({
  load,
  save: (values) => local.set(values),
  api,
  liveCertified: config.liveCertified,
  ui: {
    async openForm() {
      const state = await load();
      const tab = await chrome.tabs.create({
        url: config.fns + config.formPath,
        active: state.active?.safe !== false,
      });
      for (let i = 0; i < 40; i++) {
        const current = await chrome.tabs.get(tab.id);
        if (current.status === "complete") return tab.id;
        await new Promise((r) => setTimeout(r, 250));
      }
      throw Error("Форма ФНС не загрузилась");
    },
    fill: (id, plan) => call(id, "fill", plan),
    verify: (id, plan) => call(id, "verify", plan),
    submit: (id, plan) => call(id, "submit", plan),
    async result(id, plan) {
      for (let i = 0; i < 40; i++) {
        try {
          return await call(id, "result", plan);
        } catch (e) {
          if (e.code === "LOGIN_REQUIRED") throw e;
          if (i === 39) throw e;
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    },
  },
});
async function protect() {
  await local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.alarms.create("roota-helper", { periodInMinutes: 0.5 });
}
chrome.runtime.onInstalled.addListener(async () => {
  await local.set({ armed: false });
  await protect();
});
chrome.runtime.onStartup.addListener(async () => {
  await local.set({ armed: false });
  await protect();
});
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "roota-helper") return;
  const s = await load();
  if (!s.credential) return;
  try {
    if (
      s.active &&
      !["completed", "cleared", "preview_ready"].includes(s.active.phase)
    ) {
      await api({
        action: "heartbeat",
        status: [
          "fencing",
          "fenced",
          "clicking",
          "submitted",
          "uncertain",
          "result_pending",
        ].includes(s.active.phase)
          ? "uncertain"
          : s.active.phase === "error"
            ? "error"
            : "busy",
        detail:
          "Задача сохранена локально; при остановке нажмите «Восстановить»",
        safe: s.active.safe,
      });
    } else if (s.armed && config.liveCertified)
      await controller.start({ safe: false, mode: "live" });
    else
      await api({
        action: "heartbeat",
        status:
          s.active?.phase === "preview_ready"
            ? "preview_ready"
            : ["login_required", "error", "uncertain"].includes(
                  s.reportedStatus,
                )
              ? s.reportedStatus
              : "connected",
        detail:
          s.active?.phase === "preview_ready"
            ? "Проверено без регистрации дохода"
            : ["login_required", "error", "uncertain"].includes(
                  s.reportedStatus,
                )
              ? s.reportedDetail
              : "Безопасный режим; ожидание действия продавца",
        safe: true,
      });
  } catch (e) {
    await local.set({ lastError: e.message, armed: false });
  }
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    !sender.url?.startsWith(chrome.runtime.getURL(""))
  )
    return false;
  (async () => {
    await protect();
    if (message.action === "state") {
      const s = await load();
      return {
        id: chrome.runtime.id,
        connected: !!s.credential,
        active: s.active,
        armed: s.armed ?? false,
        lastError: s.lastError,
        liveCertified: config.liveCertified,
        lastInspection: s.lastInspection,
        previewMode: s.previewMode ?? "test",
      };
    }
    if (message.action === "inspect") {
      const tabs = await chrome.tabs.query({ url: config.fns + "/sales*" });
      const receipts = [];
      for (const tab of tabs) {
        try {
          receipts.push(await call(tab.id, "inspect"));
        } catch {
          /* Only visible receipt dialogs qualify. */
        }
      }
      if (receipts.length !== 1)
        throw Error(
          "Оставьте одну вкладку ФНС с открытым изображением сохранённого чека — из истории или после выдачи",
        );
      const found = receipts[0];
      const result = await api({
        action: "inspect",
        url: found.url,
        pixelHash: found.pixelHash,
      });
      await local.set({ lastInspection: result, lastError: null });
      return result;
    }
    if (message.action === "connect") {
      if (!/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(message.credential ?? ""))
        throw Error("Неверный формат ключа");
      // Validate a replacement credential before replacing the old one; retain every unresolved result.
      const connected = await api(
        { action: "heartbeat", status: "connected", safe: true },
        message.credential,
      );
      await local.set({
        credential: message.credential,
        armed: false,
        lastError: null,
      });
      return connected;
    }
    if (message.action === "disconnect") {
      const s = await load();
      await local.set({ credential: null, armed: false });
      return { disconnected: true, hasUnresolved: !!s.active };
    }
    if (message.action === "preview") {
      await local.set({
        previewMode: message.mode === "live" ? "live" : "test",
      });
      return controller.start({
        safe: true,
        mode: message.mode === "live" ? "live" : "test",
      });
    }
    if (message.action === "recover") return controller.recover();
    if (message.action === "clear") return controller.clear();
    if (message.action === "arm") {
      if (!config.liveCertified)
        throw Error(
          "Рабочий режим заблокирован: реальный адаптер ещё не проверен на согласованной продаже",
        );
      const r = await api({
        action: "heartbeat",
        status: "connected",
        safe: false,
      });
      if (!r.liveAllowed) throw Error("Рабочий режим не разрешён сервером");
      await local.set({ armed: true });
      return { armed: true };
    }
    if (message.action === "pause") {
      await local.set({ armed: false });
      return { armed: false };
    }
    throw Error("Неизвестное действие");
  })().then(
    (result) => respond({ ok: true, result }),
    async (error) => {
      await local.set({ lastError: error.message, armed: false });
      respond({ ok: false, error: error.message });
    },
  );
  return true;
});
