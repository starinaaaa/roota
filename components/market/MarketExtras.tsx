"use client";
import { useState } from "react";
import { Creature, MarketBrand, QrCode } from "./shared";
import {
  money,
  type MarketState,
  type PublicSale,
  type SocialLinks,
  type TransferSettings,
} from "@/lib/market/model";

export function SocialScreen({
  links,
  compact = false,
}: {
  links: SocialLinks;
  compact?: boolean;
}) {
  return (
    <section className={`market-social ${compact ? "is-compact" : ""}`}>
      <div>
        <p className="market-eyebrow">Мы встретились на Ceramania</p>
        <h1>
          Давайте <br />
          не потеряемся.
        </h1>
        <p>
          Керамика, чудики и жизнь мастерской.
          <br />
          Заберите Руту с собой.
        </p>
        <nav aria-label="Ссылки Руты">
          <a href={links.telegram} target="_blank" rel="noreferrer">
            Telegram ↗︎
          </a>
          <a href={links.site} target="_blank" rel="noreferrer">
            Сайт ↗︎
          </a>
          <a href={links.instagram} target="_blank" rel="noreferrer">
            Instagram ↗︎
          </a>
        </nav>
        <div className="market-social-creatures">
          <Creature id={2899} />
          <Creature id={2907} />
        </div>
      </div>
      <div className="market-social-qr">
        <QrCode value={links.hello} />
        <h2>Сохраним знакомство?</h2>
        <p>
          Наведите камеру — все ссылки
          <br />
          откроются на вашем телефоне.
        </p>
        <span>roota.moscow</span>
      </div>
    </section>
  );
}
export function HelloPage({ links }: { links: SocialLinks }) {
  return (
    <main className="market-hello">
      <header>
        <MarketBrand />
      </header>
      <section className="market-hello-story">
        <div className="market-hello-intro">
          <p className="market-eyebrow">Кажется, мы уже знакомы</p>
          <Creature id={2891} />
        </div>
        <h1>
          Те самые чудики
          <br />с Ceramania.
        </h1>
        <p>
          Останемся на связи? Здесь можно посмотреть работы, заглянуть в
          мастерскую и узнать о следующих встречах.
        </p>
      </section>
      <nav className="market-hello-links" aria-label="Roota после маркета">
        <a
          className="market-primary"
          href={links.telegram}
          target="_blank"
          rel="noreferrer"
        >
          Заглянуть в Telegram ↗︎
        </a>
        <a className="market-secondary" href={links.site}>
          Посмотреть керамику ↗︎
        </a>
        <a
          className="market-secondary"
          href={links.instagram}
          target="_blank"
          rel="noreferrer"
        >
          Roota в Instagram ↗︎
        </a>
      </nav>
      <small>Сделано руками. Выбрано сердцем.</small>
    </main>
  );
}
export function TransferPreferences({
  initial,
  busy,
  onSave,
}: {
  initial: TransferSettings;
  busy: boolean;
  onSave: (data: TransferSettings) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="market-preferences"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSave(value);
      }}
    >
      <h2>Перевод по номеру телефона</h2>
      <p>
        Укажите банк, в котором покупатель должен проверить получателя.
        Банковскую ссылку для QR можно добавить позже.
      </p>
      {(
        [
          ["phone", "Номер телефона"],
          ["recipient", "Получатель"],
          ["bank", "Банк получателя"],
          ["link", "Ссылка для перевода из банка (необязательно)"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            type={key === "link" ? "url" : "text"}
            maxLength={key === "link" ? 2048 : 150}
            value={value[key]}
            onChange={(e) => setValue((v) => ({ ...v, [key]: e.target.value }))}
            required={key === "phone" || key === "recipient"}
          />
        </label>
      ))}
      <button className="market-primary" disabled={busy}>
        Сохранить реквизиты
      </button>
    </form>
  );
}
export function NewMarketItem({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (data: unknown) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [price, setPrice] = useState(""),
    [stock, setStock] = useState("1"),
    [kind, setKind] = useState("object");
  return (
    <section className="market-add-item">
      <button
        className="market-secondary"
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        + Товар только для маркета
      </button>
      {open ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave({
              name,
              kind,
              price: Number(price),
              stock: Number(stock),
            });
          }}
        >
          <label>
            Название
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Вид
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="object">Объект</option>
              <option value="plate">Тарелка</option>
              <option value="postcard">Открытка</option>
            </select>
          </label>
          <label>
            Цена, ₽
            <input
              required
              type="number"
              min={1}
              max={1000000}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label>
            Количество
            <input
              required
              type="number"
              min={0}
              max={100000}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </label>
          <button className="market-primary" disabled={busy}>
            Добавить позицию
          </button>
        </form>
      ) : null}
    </section>
  );
}
export function ManualInstructions({ sale }: { sale: PublicSale }) {
  return sale.method === "transfer" ? (
    <div className="market-transfer">
      <p className="market-eyebrow">Перевод по телефону</p>
      <strong className="market-transfer-phone">
        {sale.transfer?.phone.replace(
          /^(\+7)(\d{3})(\d{3})(\d{2})(\d{2})$/,
          "$1 $2 $3-$4-$5",
        )}
      </strong>
      <p>{sale.transfer?.recipient}</p>
      {sale.transfer?.bank ? (
        <p>Банк: {sale.transfer.bank}</p>
      ) : (
        <p className="market-small">Уточните банк у продавца</p>
      )}
      <p className="market-small">
        Проверьте имя получателя и сумму {money(sale.amount)} перед переводом.
      </p>
    </div>
  ) : (
    <div className="market-transfer">
      <h2>Оплата наличными</h2>
      <p>
        Передайте продавцу {money(sale.amount)}.<br />
        Он подтвердит получение.
      </p>
      <Creature id={2903} />
    </div>
  );
}
export function ReceiptTasks({
  state,
  busy,
  action,
}: {
  state: MarketState;
  busy: boolean;
  action: (body: unknown) => Promise<boolean>;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({}),
    [copied, setCopied] = useState("");
  return (
    <section className="market-receipt-tasks" id="market-receipt-tasks">
      <div className="market-section-heading">
        <h2>Чеки за наличные и переводы</h2>
        <span>{state.receiptQueue.length} ожидают чека</span>
      </div>
      <p className="market-small">
        Подтверждение денег сохраняет продажу. Чек ФНС выдаётся отдельно в «Моём
        налоге»; после добавления ссылки он появится на iPad. За оплаты
        Робокассой чек выдаёт подключённый сервис.
      </p>
      {state.receiptQueue.map((s) => (
        <details key={s.id} open={state.sale?.id === s.id}>
          <summary>
            {s.number} · {money(s.amount)}
            {s.mode === "test" ? " · тест: не выдавайте реальный чек" : ""}
          </summary>
          <div className="market-receipt-task-content">
            <p className="market-small">
              Дата оплаты:{" "}
              {new Date(s.paidAt!).toLocaleDateString("ru-RU", {
                timeZone: "Europe/Moscow",
              })}
              . Покупатель — физическое лицо.
            </p>
            <div className="market-receipt-guide">
              <p>
                <strong>Чек ФНС ещё не выдан.</strong> Деньги сохранены в кассе,
                но регистрация дохода пока не подключена автоматически.
              </p>
              {s.mode === "live" ? (
                <a
                  className="market-primary"
                  href="https://lknpd.nalog.ru/sales/create"
                  target="_blank"
                  rel="noreferrer"
                >
                  1. Открыть «Мой налог» ↗︎
                </a>
              ) : (
                <p>Тестовая покупка: реальный чек выдавать не нужно.</p>
              )}
              <p>
                2. Добавьте продажу на дату оплаты: физическое лицо, позиции и
                суммы ниже. После выдачи чека скопируйте его ссылку сюда.
              </p>
            </div>
            {s.items.map((item, index) => (
              <div className="market-copy-row" key={index}>
                <span>
                  {item.name}
                  {item.quantity > 1 ? ` × ${item.quantity}` : ""} —{" "}
                  {money(item.sum)}
                </span>
                <button
                  className="market-secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        item.name +
                          (item.quantity > 1 ? ` × ${item.quantity}` : ""),
                      );
                      setCopied(`${s.id}-${index}-name`);
                    } catch {
                      setCopied("");
                    }
                  }}
                >
                  {copied === `${s.id}-${index}-name`
                    ? "Скопировано"
                    : "Название"}
                </button>
                <button
                  className="market-secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(String(item.sum));
                      setCopied(`${s.id}-${index}-sum`);
                    } catch {
                      setCopied("");
                    }
                  }}
                >
                  {copied === `${s.id}-${index}-sum` ? "Скопировано" : "Сумма"}
                </button>
              </div>
            ))}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await action({
                  action: "receipt",
                  id: s.id,
                  url: urls[s.id] ?? "",
                });
              }}
            >
              <label>
                Ссылка на выданный чек ФНС
                <input
                  type="url"
                  required
                  placeholder="https://lknpd.nalog.ru/api/v1/receipt/…/print"
                  value={urls[s.id] ?? ""}
                  onChange={(e) =>
                    setUrls((v) => ({ ...v, [s.id]: e.target.value }))
                  }
                />
              </label>
              <button className="market-secondary" disabled={busy}>
                3. Сохранить и показать чек на iPad
              </button>
            </form>
          </div>
        </details>
      ))}
    </section>
  );
}
export function ReceiptDownload({
  sale,
}: {
  sale: Pick<PublicSale, "id" | "receiptUrl">;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download(format: "full" | "label") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/market/receipt/${sale.id}?format=${format}`,
        { cache: "no-store", signal: AbortSignal.timeout(20000) },
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Не удалось скачать чек");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roota-receipt-${sale.id}${format === "label" ? "-40x58" : ""}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось скачать чек");
    } finally {
      setBusy(false);
    }
  }
  return sale.receiptUrl ? (
    <div className="market-downloads">
      <button
        className="market-secondary"
        disabled={busy}
        onClick={() => download("full")}
      >
        Скачать чек PDF
      </button>
      <button
        className="market-secondary"
        disabled={busy}
        onClick={() => download("label")}
      >
        QR чека · 40×58 мм
      </button>
      <a href={sale.receiptUrl} target="_blank" rel="noreferrer">
        Открыть чек ФНС ↗︎
      </a>
      {error ? (
        <p role="alert" className="market-error">
          {error}
        </p>
      ) : null}
    </div>
  ) : null;
}
