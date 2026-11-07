"use client";
import { useState } from "react";
import { marketFetch } from "./shared";
import type { MarketState } from "@/lib/market/model";
import { money } from "@/lib/market/model";
const labels: Record<string, string> = {
  offline: "Не подключён",
  connected: "Подключён",
  login_required: "Требуется вход в ФНС",
  busy: "Выполняется задача",
  error: "Ошибка — выдача остановлена",
  uncertain: "Результат требует проверки",
  preview_ready: "Форма проверена, доход не зарегистрирован",
};
function HelperActivation({
  helper,
  state,
  busy,
  onAction,
}: {
  helper: MarketState["helpers"][number];
  state: MarketState;
  busy: boolean;
  onAction: (body: unknown) => Promise<void>;
}) {
  const [scope, setScope] = useState("future");
  return (
    <details className="market-helper-settings">
      <summary>Настроить рабочую выдачу</summary>
      <p className="market-small">
        {helper.live_enabled
          ? helper.live_all_sales
            ? "Разрешены автоматические чеки для новых покупок после включения. Старая очередь требует отдельной сверки."
            : "Разрешена только одна согласованная покупка."
          : "Работает только заполнение без выдачи. Для автоматических чеков нужно разрешение здесь и включение в окне расширения."}
      </p>
      {!helper.result_verified_at ? (
        <p className="market-small">
          Перед рабочим режимом откройте уже сохранённый чек ФНС и нажмите в
          расширении «Проверить открытый чек без выдачи».
        </p>
      ) : (
        <p className="market-small">
          Получение оригинального чека этим устройством проверено.
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          await onAction({
            action: "helper-mode",
            id: helper.id,
            scope,
            saleId: scope === "trial" ? form.get("saleId") : undefined,
            acknowledged: form.get("acknowledged") === "on",
          });
        }}
      >
        <label>
          Какие покупки выдавать
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="future">Только новые покупки после включения</option>
            <option value="trial">Одна согласованная покупка</option>
          </select>
        </label>
        {scope === "trial" ? (
          <label>
            Покупка
            <select name="saleId" required defaultValue="">
              <option value="" disabled>
                Выберите покупку
              </option>
              {state.receiptQueue
                .filter(
                  (s) => s.mode === "live" && s.receiptStatus === "queued",
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.number} · {money(s.amount)}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        <label className="market-consent">
          <input name="acknowledged" type="checkbox" required />
          <span>
            {scope === "trial"
              ? "Подтверждаю: деньги получены и чек по выбранной покупке ещё не выдавался."
              : "Разрешаю создавать чеки за новые наличные и прямые переводы после нажатия «Деньги получены»."}
          </span>
        </label>
        <button
          className="market-secondary"
          disabled={busy || !helper.result_verified_at}
        >
          Разрешить рабочую выдачу
        </button>
      </form>
      {helper.live_enabled ? (
        <button
          className="market-secondary"
          disabled={busy}
          onClick={() =>
            void onAction({
              action: "helper-mode",
              id: helper.id,
              scope: "safe",
            })
          }
        >
          Остановить рабочую выдачу
        </button>
      ) : null}
    </details>
  );
}
export default function ReceiptHelper({ state }: { state: MarketState }) {
  const [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function action(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await marketFetch("/api/market/admin", body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="market-receipt-tasks">
      <h2>Локальный помощник чеков</h2>
      <p className="market-small">
        Помощник работает в Chrome продавца. В безопасном режиме он только
        заполняет форму. Для автоматической выдачи разрешите покупки ниже и
        включите рабочий режим в расширении.
      </p>
      {state.helpers.map((h) => (
        <div key={h.id}>
          <div className="market-copy-row">
            <span>
              {h.name} ·{" "}
              {h.revoked_at
                ? "Доступ отозван"
                : !h.last_seen_at ||
                    Date.now() - Date.parse(h.last_seen_at) > 120000
                  ? "Нет связи"
                  : (labels[h.status] ?? h.status)}{" "}
              ·{" "}
              {h.operation_mode === "safe"
                ? "без выдачи чека"
                : "рабочий режим"}
              {h.detail ? <small> · {h.detail}</small> : null}
            </span>
            {!h.revoked_at ? (
              <button
                className="market-secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await marketFetch("/api/market/admin", {
                      action: "helper-revoke",
                      id: h.id,
                    });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Ошибка");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Отозвать доступ
              </button>
            ) : null}
          </div>
          {!h.revoked_at ? (
            <HelperActivation
              helper={h}
              state={state}
              busy={busy}
              onAction={action}
            />
          ) : null}
        </div>
      ))}
      <details>
        <summary>Подключить расширение Chrome</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            setToken("");
            try {
              const r = await marketFetch<{
                helperCredential: { token: string };
              }>("/api/market/admin", {
                action: "helper-create",
                name: f.get("name"),
                extensionId: f.get("extension"),
              });
              setToken(r.helperCredential.token);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Ошибка");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Название устройства
            <input
              name="name"
              required
              maxLength={80}
              defaultValue="MacBook маркета"
            />
          </label>
          <label>
            ID расширения из chrome://extensions
            <input
              name="extension"
              required
              pattern="[a-p]{32}"
              maxLength={32}
            />
          </label>
          <button className="market-secondary" disabled={busy}>
            Создать отдельный доступ
          </button>
        </form>
        {token ? (
          <div role="status">
            <p>
              Ключ показан только сейчас. Вставьте его в окно расширения. В ФНС
              этот ключ не передаётся.
            </p>
            <textarea
              readOnly
              value={token}
              aria-label="Одноразовое отображение ключа помощника"
            />
            <button className="market-secondary" onClick={() => setToken("")}>
              Скрыть ключ
            </button>
          </div>
        ) : null}
      </details>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
