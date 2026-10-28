"use client";
import { productionEstimate } from "@/lib/preorder-copy";
import { bindPrepositions } from "@/lib/typography";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { addToWaitlist } from "@/lib/actions/waitlist";
import { addToCart } from "@/lib/actions/cart";

const subscribeToMount = () => () => {};
const clientMounted = () => true;
const serverMounted = () => false;

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
  const mounted = useSyncExternalStore(
    subscribeToMount,
    clientMounted,
    serverMounted,
  );
  const [tab, setTab] = useState(initialTab);
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const hasPreorder = preorderEnabled && !!leadTimeDays;
  useEffect(() => {
    if (!mounted) return;
    const element = dialog.current;
    const previous = document.body.style.overflow;
    const focused = document.activeElement;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previous;
      if (focused instanceof HTMLElement && focused.isConnected)
        focused.focus();
    };
  }, [mounted]);
  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby="stock-modal-title"
      aria-describedby="stock-modal-description"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          onClose();
      }}
      className="fixed inset-0 m-auto w-[calc(100%-32px)] max-w-md max-h-[calc(100dvh-32px)] overflow-y-auto overscroll-contain border-0 bg-stone-50 p-6 text-stone-900 shadow-xl backdrop:bg-stone-900/35 sm:p-9"
    >
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center text-stone-500 hover:text-stone-900"
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <p className="mb-3 pr-10 text-xs uppercase tracking-[0.12em] text-stone-500">
        {saved ? "Заявка сохранена" : tab === "preorder" && hasPreorder ? "Предзаказ" : "Поступление изделия"}
      </p>
      <h2 id="stock-modal-title" className="mb-3 pr-7 text-2xl leading-tight">
        {bindPrepositions(productName)}
      </h2>
      <p
        id="stock-modal-description"
        className="mb-6 text-sm leading-relaxed text-stone-600"
      >
        {bindPrepositions(
          saved
            ? "Сообщим на указанный email, когда изделие появится в наличии. Подтверждать адрес не нужно."
            : tab === "preorder" && hasPreorder
              ? "Изготовим специально для вас. Начнём после оплаты."
            : availableQty > 0
              ? "Нужное количество недоступно. Оставьте email — сообщим о пополнении."
              : "Оставьте email — сообщим, когда изделие появится в наличии.",
        )}
      </p>
      {saved ? (
        <div role="status" className="space-y-5">
          <div className="flex items-center gap-3 text-sm">
            <Check size={20} aria-hidden="true" />
            <span>Вы подписаны на поступление</span>
          </div>
          <button className="admin-button w-full" onClick={onClose}>
            Готово
          </button>
        </div>
      ) : (
        <>
          {hasPreorder && (
            <div className="mb-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={tab === "waitlist"}
                className="admin-secondary"
                onClick={() => {
                  setTab("waitlist");
                  setMessage("");
                }}
              >
                Уведомить
              </button>
              <button
                type="button"
                aria-pressed={tab === "preorder"}
                className="admin-secondary"
                onClick={() => {
                  setTab("preorder");
                  setMessage("");
                }}
              >
                Предзаказ
              </button>
            </div>
          )}
          {tab === "preorder" && hasPreorder ? (
            <div className="space-y-5">
              <p className="text-sm leading-relaxed">
                Изготовление — {productionEstimate(leadTimeDays)} после оплаты. Контакты и доставку можно
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
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!consent || pending) return;
                setMessage("");
                start(async () => {
                  try {
                    const result = await addToWaitlist(
                      productId,
                      contact,
                      consent,
                    );
                    if (result.error) setMessage(result.error);
                    else setSaved(true);
                  } catch {
                    setMessage(
                      "Не удалось сохранить заявку. Попробуйте позже.",
                    );
                  }
                });
              }}
            >
              <label className="block text-sm">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="admin-input"
                  required
                  value={contact}
                  maxLength={254}
                  onChange={(e) => setContact(e.target.value)}
                />
              </label>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-stone-900"
                  />
                  <span>
                    Согласен на уведомление о поступлении и обработку email.
                  </span>
                </label>
                <p className="pl-7 text-xs leading-relaxed text-stone-500">
                  Отписаться можно в письме.{" "}
                  <a href="/privacy" className="underline underline-offset-2">
                    Политика конфиденциальности
                  </a>
                </p>
              </div>
              <button
                className="admin-button min-h-12 w-full"
                disabled={pending}
              >
                {pending ? "Сохраняю…" : "Сообщить о поступлении"}
              </button>
            </form>
          )}
          {message && (
            <p
              role="alert"
              className="mt-4 text-sm leading-relaxed text-red-700"
            >
              {message}
            </p>
          )}
        </>
      )}
    </dialog>,
    document.body,
  );
}
