"use client";
import { useState } from "react";
import { marketFetch } from "./shared";
import type { MarketState } from "@/lib/market/model";
const labels: Record<string, string> = {
  offline: "Не подключён",
  connected: "Подключён",
  login_required: "Требуется вход в ФНС",
  busy: "Выполняется задача",
  error: "Ошибка — выдача остановлена",
  uncertain: "Результат требует проверки",
  preview_ready: "Форма проверена, доход не зарегистрирован",
};
export default function ReceiptHelper({ state }: { state: MarketState }) {
  const [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="market-receipt-tasks">
      <h2>Локальный помощник чеков</h2>
      <p className="market-small">
        Безопасная проверка заполняет форму ФНС, но не выдаёт чек. Рабочая
        выдача требует отдельного включения после проверки на согласованной
        продаже.
      </p>
      {state.helpers.map((h) => (
        <div key={h.id} className="market-copy-row">
          <span>
            {h.name} ·{" "}
            {h.revoked_at
              ? "Доступ отозван"
              : !h.last_seen_at ||
                  Date.now() - Date.parse(h.last_seen_at) > 120000
                ? "Нет связи"
                : (labels[h.status] ?? h.status)}{" "}
            ·{" "}
            {h.operation_mode === "safe" ? "без выдачи чека" : "рабочий режим"}
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
