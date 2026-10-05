"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { addToWaitlist } from "@/lib/actions/waitlist";
import { addToCart } from "@/lib/actions/cart";
export default function StockLimitModal({
  productId,
  productName,
  availableQty,
  onClose,
  preorderEnabled = false,
  leadTimeDays = null,
  initialTab = "waitlist",
}: {
  productId: string;
  productName: string;
  availableQty: number;
  onClose: () => void;
  preorderEnabled?: boolean;
  leadTimeDays?: number | null;
  initialTab?: "waitlist" | "preorder";
}) {
  const [tab, setTab] = useState(initialTab),
    [contact, setContact] = useState(""),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition(),
    router = useRouter();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <>
      <motion.div
        className="fixed inset-0 bg-stone-900/25 z-[80]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={productName}
        className="fixed z-[81] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-32px)] max-w-md bg-stone-50 p-6 md:p-9 max-h-[85vh] overflow-y-auto"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button
          aria-label="Закрыть"
          className="absolute top-4 right-4 p-2"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <h2 className="text-lg pr-6 mb-4">{productName}</h2>
        <p className="text-sm text-stone-600 mb-5">
          {availableQty > 0
            ? "Доступное количество ограничено."
            : "Сейчас изделие отсутствует в наличии."}
        </p>
        <div className="flex gap-3 mb-6">
          <button
            className="admin-secondary"
            onClick={() => setTab("waitlist")}
          >
            Уведомить
          </button>
          {preorderEnabled && leadTimeDays && (
            <button
              className="admin-secondary"
              onClick={() => setTab("preorder")}
            >
              Предзаказ
            </button>
          )}
        </div>
        {tab === "preorder" && preorderEnabled && leadTimeDays ? (
          <div className="space-y-5">
            <p>
              Изготовление: {leadTimeDays} дней. Контакты и доставку можно
              указать при оформлении.
            </p>
            <button
              disabled={pending}
              className="admin-button w-full"
              onClick={() =>
                start(async () => {
                  try {
                    const result = await addToCart(productId, 1, "preorder");
                    if (result.error) setMessage(result.error);
                    else {
                      onClose();
                      router.push("/checkout");
                      router.refresh();
                    }
                  } catch {
                    setMessage("Не удалось добавить предзаказ");
                  }
                })
              }
            >
              {pending ? "Добавляю…" : "Добавить предзаказ и оформить"}
            </button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                try {
                  const result = await addToWaitlist(productId, contact);
                  setMessage(
                    result.error ??
                      "Заявка сохранена. Мы сообщим о поступлении.",
                  );
                } catch {
                  setMessage("Не удалось сохранить заявку");
                }
              });
            }}
          >
            <label>
              Email или телефон
              <input
                className="admin-input"
                required
                value={contact}
                maxLength={254}
                onChange={(e) => setContact(e.target.value)}
              />
            </label>
            <button className="admin-button w-full" disabled={pending}>
              {pending ? "Сохраняю…" : "Сообщить о поступлении"}
            </button>
          </form>
        )}
        <p role="status" className="text-sm mt-4">
          {message}
        </p>
      </motion.div>
    </>
  );
}
