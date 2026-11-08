"use client";
import MarketPayment, { type BuyerSale } from "./MarketPayment";
import MarketDisplay from "./MarketDisplay";
import MarketIntake from "./MarketIntake";
import MarketReview from "./MarketReview";
import { MarketBrand } from "./shared";
import type { SocialLinks } from "@/lib/market/model";
import type { MarketPreviewScreen } from "@/lib/market/preview";

export default function MarketPreview({
  screen,
  links,
}: {
  screen: MarketPreviewScreen;
  links: SocialLinks;
}) {
  const sale: BuyerSale = {
    id: "demo",
    number: "М-000001",
    mode: "test",
    status: "pending",
    method: "robokassa",
    amount: 6000,
    items: [
      {
        name: "Керамическая тарелка «Поцелуй»",
        quantity: 1,
        sum: 6000,
        kind: "goods",
      },
    ],
    expiresAt: "2099-01-01T00:00:00Z",
    paidAt: null,
    receiptUrl: null,
    receiptStatus: "not_due",
    receiptRegisteredAt: null,
    paymentUrl: "https://roota.moscow/market/preview/email",
    qr: null,
    emailSaved: false,
    transfer: {
      phone: "+79990000000",
      recipient: "Пример получателя",
      bank: "Банк продавца",
      link: "",
    },
  };
  if (["transfer", "cash"].includes(screen)) {
    sale.method = screen === "cash" ? "cash" : "transfer";
    sale.emailSaved = true;
  }
  if (["paid", "receipt", "paid-email"].includes(screen)) {
    sale.status = "paid";
    sale.method = "transfer";
    sale.paidAt = "2026-11-08T17:00:00Z";
    sale.emailSaved = screen !== "paid-email";
    sale.receiptStatus = "queued";
  }
  if (screen === "receipt") {
    sale.receiptStatus = "registered";
    sale.receiptUrl = "https://roota.moscow/market/preview/receipt-document";
    sale.receiptEmailState = "delivered";
  }
  if (screen === "expired") sale.status = "expired";
  return (
    <>
      <aside className="market-preview-notice">
        Демо для просмотра · покупки, платежи и письма не создаются
      </aside>
      {screen.startsWith("display") ? (
        <MarketDisplay
          preview={{
            links,
            connected: true,
            needsPairing: false,
            sale: screen === "display" ? null : sale,
          }}
        />
      ) : screen === "review" || screen === "review-saved" ? (
        <MarketReview
          token="demo"
          preview={{
            number: sale.number,
            items: sale.items,
            saved: screen === "review-saved",
            publicationConsent: false,
            reward: {
              code: "DEMO-ROOTA",
              expiresAt: "2026-12-08T20:59:59Z",
              available: true,
            },
          }}
        />
      ) : screen === "buy" ? (
        <MarketIntake
          preview={{
            number: "",
            amount: 0,
            method: "transfer",
            paid: false,
            cancelled: false,
            mode: "test",
            transfer: sale.transfer,
            redirectUrl: null,
            enabled: true,
            robokassa: true,
          }}
        />
      ) : screen === "receipt-document" ? (
        <main className="market-phone">
          <header>
            <MarketBrand />
          </header>
          <section className="market-phone-receipt">
            <h1>Пример чека</h1>
            <p>
              Это демонстрация, не чек ФНС. В настоящей покупке эта кнопка
              откроет оригинальный документ ФНС.
            </p>
            <p>Керамическая тарелка «Поцелуй» · 6 000 ₽</p>
          </section>
        </main>
      ) : (
        <MarketPayment
          token="demo"
          preview={sale}
          returning={screen === "returning"}
        />
      )}
    </>
  );
}
