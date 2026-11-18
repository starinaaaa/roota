import type { PublicSale } from "@/lib/market/model";

export function BuyerReceipt({
  sale,
  token,
  emailSaved,
  emailState,
  preview = false,
}: {
  sale: PublicSale;
  token: string;
  emailSaved: boolean;
  emailState: string | null;
  preview?: boolean;
}) {
  if (sale.method === "robokassa")
    return <p>Чек по оплате через Робокассу придёт на вашу почту.</p>;
  const ready = sale.receiptStatus === "registered" && sale.receiptUrl;
  const problem = ["failed", "uncertain"].includes(sale.receiptStatus);
  if (!ready && !problem)
    return (
      <p className="market-collect-note">
        Всё оплачено, покупку можно забирать. Чек появится здесь.
        {emailSaved && sale.mode === "live" && " Копию отправим на вашу почту."}
      </p>
    );
  const emailProblem = [
    "failed",
    "unknown",
    "bounced",
    "complained",
    "cancelled",
    "unsubscribed",
  ].includes(emailState ?? "");
  return (
    <section
      className="market-buyer-receipt"
      aria-label="Чек за покупку"
      aria-live="polite"
    >
      <h2>{ready ? "Ваш чек" : "Проверяем выдачу чека"}</h2>
      {ready ? (
        <>
          <a
            className="market-primary"
            href={
              preview
                ? "/market/preview/receipt-document"
                : `/api/market/pay/${token}/receipt`
            }
            download={!preview}
          >
            Открыть чек
          </a>
          <p className="market-small">
            {sale.mode === "test"
              ? "Тестовая покупка — письма не отправляются."
              : !emailSaved
                ? "Чек можно открыть и сохранить здесь. Оставьте почту ниже, чтобы получить его письмом."
                : emailState === "delivered"
                  ? "Чек доставлен на вашу почту."
                  : emailState === "accepted"
                    ? "Чек передан почтовому сервису для отправки."
                    : emailProblem
                      ? "Не удалось подтвердить доставку письма. Чек можно открыть и скачать здесь."
                      : ["pending", "sending"].includes(emailState ?? "")
                        ? "Отправляем чек на вашу почту."
                        : "Ваша почта сохранена для получения чека."}
          </p>
        </>
      ) : (
        <p>
          Деньги получены. Уточните у продавца, готов ли чек. После
          подтверждения он появится здесь.
        </p>
      )}
    </section>
  );
}
