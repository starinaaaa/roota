"use client";

import { bindPrepositions } from "@/lib/typography";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/products";
import { createOrder } from "@/lib/actions/orders";
import type { CartItem, CheckoutFormData } from "@/types";

import PhoneField from "./PhoneField";
import DeliverySelector from "./DeliverySelector";
import { checkoutSchema } from "@/lib/validation";
import type { DeliveryQuote } from "@/lib/delivery/model";

type Props = {
  initialItems: CartItem[];
  deliveryEnabled: boolean;
};

export default function CheckoutForm({ initialItems, deliveryEnabled }: Props) {
  const router = useRouter();
  const requestKey = useRef<string | null>(null);
  const submitting = useRef(false);

  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CheckoutFormData>({
    name: "",
    phone: "+7",
    email: "",
    deliveryType: "russia",
    address: "",
    comment: "",
    subscribeToNews: false,
  });

  const totalPrice = initialItems.reduce(
    (sum, i) => sum + i.product.price * i.quantity,
    0,
  );

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setError(null);
  }

  function receiveQuote(next: DeliveryQuote | null) {
    setQuote(next);
    setFormData((prev) => ({
      ...prev,
      deliveryQuoteId: next?.id,
      address: next?.point.address ?? "",
    }));
  }
  function validateField(name: string) {
    const parsed = checkoutSchema.safeParse(formData);
    const message = parsed.success
      ? ""
      : (parsed.error.issues.find((i) => i.path[0] === name)?.message ?? "");
    setFieldErrors((prev) => ({ ...prev, [name]: message }));
  }
  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(
      () => {
        receiveQuote(null);
        setError("Расчёт доставки устарел. Рассчитайте доставку ещё раз.");
      },
      Math.max(0, Date.parse(quote.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [quote]);
  const cartKey = JSON.stringify(
    initialItems.map((i) => [
      i.product_id,
      i.quantity,
      i.product.price,
      i.purchase_mode,
    ]),
  );
  const finalTotal = quote
    ? Math.round((totalPrice + quote.totalCost) * 100) / 100
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    const validated = checkoutSchema.safeParse({
      ...formData,
      address: quote?.point.address ?? "Пункт ещё не выбран",
    });
    if (!validated.success) {
      const fields: Record<string, string> = {};
      for (const issue of validated.error.issues) {
        const name = String(issue.path[0]);
        fields[name] ??= issue.message;
      }
      setFieldErrors(fields);
      setError("Проверьте данные заказа.");
      document.getElementById(Object.keys(fields)[0])?.focus();
      return;
    }
    if (!quote || finalTotal === null) {
      setError("Выберите пункт выдачи и рассчитайте доставку.");
      return;
    }

    submitting.current = true;
    requestKey.current ??= crypto.randomUUID();
    setPending(true);
    setError(null);

    // createOrder reads cart from Supabase server-side — no items passed
    let result;
    try {
      result = await createOrder(formData, requestKey.current, finalTotal);
    } catch {
      result = {
        success: false as const,
        error: "Нет соединения. Повторите отправку.",
      };
    }

    if (result.success) {
      router.push(
        result.paymentId
          ? `/payment/${result.paymentId}`
          : `/order-success?id=${result.orderId}`,
      );
    } else {
      if (/достав|упаков|Корзина|Цена изменилась/i.test(result.error))
        receiveQuote(null);
      setError(result.error);
      setPending(false);
      submitting.current = false;
    }
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 md:px-12 lg:px-16 py-12 md:py-16">
      <h1 className="font-display text-page text-stone-900 mb-12">
        Оформление заказа
      </h1>

      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-16 xl:gap-24">
        {/* ── Форма ──────────────────────────────────────────── */}
        <form
          id="checkout-form"
          onSubmit={handleSubmit}
          className="space-y-8"
          noValidate
        >
          <fieldset disabled={pending} className="space-y-8">
            {/* Контактные данные */}
            <fieldset className="space-y-5">
              <legend className="font-body text-ui tracking-[0.08em] uppercase text-stone-600 mb-6">
                Контактные данные
              </legend>

              <Field
                error={fieldErrors.name}
                onBlur={() => validateField("name")}
                label="Имя *"
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                placeholder="Как к вам обращаться"
                autoComplete="given-name"
                required
              />

              <PhoneField
                value={formData.phone}
                onChange={(value) => {
                  setFormData((prev) => ({ ...prev, phone: value }));
                  setFieldErrors((prev) => ({ ...prev, phone: "" }));
                  setError(null);
                  receiveQuote(null);
                }}
                onBlur={() => validateField("phone")}
                error={fieldErrors.phone}
                onInvalidPaste={(message) =>
                  setFieldErrors((prev) => ({ ...prev, phone: message }))
                }
              />

              <Field
                error={fieldErrors.email}
                onBlur={() => validateField("email")}
                label="Email *"
                id="email"
                name="email"
                type="email"
                value={formData.email ?? ""}
                onChange={handleChange}
                placeholder="example@email.com"
                autoComplete="email"
                required
              />
            </fieldset>

            <div className="divider" />

            <DeliverySelector
              phone={formData.phone}
              cartKey={cartKey}
              enabled={deliveryEnabled}
              onQuote={receiveQuote}
            />

            {/* Комментарий */}
            <div className="space-y-2">
              <label
                htmlFor="comment"
                className="font-body text-ui tracking-[0.08em] uppercase text-stone-600 block"
              >
                Комментарий
              </label>
              <textarea
                id="comment"
                name="comment"
                value={formData.comment ?? ""}
                onChange={handleChange}
                placeholder="Пожелания к заказу, удобное время доставки"
                rows={3}
                className="
                  w-full border border-stone-200 bg-transparent
                  font-body text-ui text-stone-800
                  px-4 py-3 resize-none
                  placeholder:text-stone-600
                  focus:outline-none focus:border-stone-500
                  transition-colors duration-200
                "
              />
            </div>

            {/* Подписка на новости */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                name="subscribeToNews"
                checked={formData.subscribeToNews}
                onChange={handleChange}
                className="mt-1 w-4 h-4 accent-stone-900 cursor-pointer"
              />
              <span className="font-body text-ui tracking-[0.05em] text-stone-600 group-hover:text-stone-900 transition-colors duration-200">
                Даю отдельное согласие на получение новостей и рекламных
                сообщений студии по электронной почте. Отказ не влияет на заказ.
              </span>
            </label>
            <Link
              href="/newsletter-consent"
              className="font-body text-ui text-stone-600 underline underline-offset-2"
            >
              Условия согласия на рассылку и обработку данных для неё
            </Link>

            {/* Ошибка */}
            <AnimatePresence>
              {error && (
                <motion.p
                  role="alert"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="font-body text-ui text-red-600 mt-2"
                >
                  {bindPrepositions(error)}
                </motion.p>
              )}
            </AnimatePresence>
          </fieldset>
        </form>

        {/* ── Summary ────────────────────────────────────────── */}
        <div className="mt-12 lg:mt-0">
          <div className="lg:sticky lg:top-28 space-y-6">
            <h2 className="font-body text-caption tracking-[0.08em] uppercase text-stone-600">
              Ваш заказ
            </h2>

            {/* Товары */}
            <div className="space-y-0">
              {initialItems.map((item) => (
                <div
                  key={item.product.id}
                  className="flex gap-4 py-4 border-b border-stone-100 last:border-b-0"
                >
                  <div
                    className="relative w-14 bg-stone-100 shrink-0 overflow-hidden"
                    style={{ height: "72px" }}
                  >
                    {item.product.images[0] && (
                      <Image
                        src={item.product.images[0]}
                        alt={item.product.name}
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    )}
                  </div>
                  <div className="flex flex-col justify-center flex-1 min-w-0">
                    <p className="font-body text-caption text-stone-700 truncate">
                      {bindPrepositions(item.product.name)}
                    </p>
                    <p className="font-body text-caption text-stone-600 mt-0.5">
                      × {item.quantity}
                    </p>
                    {item.purchase_mode === "preorder" && (
                      <p className="text-caption text-stone-600">
                        Предзаказ · изготовление {item.product.lead_time_days}
                        {bindPrepositions(" ")}
                        дней
                      </p>
                    )}
                  </div>
                  <p className="font-body text-ui text-stone-800 shrink-0 self-center">
                    {bindPrepositions(
                      formatPrice(item.product.price * item.quantity),
                    )}
                  </p>
                </div>
              ))}
            </div>

            {/* Итого */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-body text-ui text-stone-600">Товары</span>
                <span className="font-body text-ui text-stone-700">
                  {bindPrepositions(formatPrice(totalPrice))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-body text-ui text-stone-600">
                  Доставка
                </span>
                <span className="font-body text-caption text-stone-600">
                  {bindPrepositions(
                    quote ? formatPrice(quote.totalCost) : "нужен расчёт",
                  )}
                </span>
              </div>
              {quote && (
                <p className="font-body text-caption text-stone-600">
                  Включая страховку{" "}
                  {bindPrepositions(formatPrice(quote.insuranceCost))}
                  {quote.estimatedDays !== null && (
                    <>
                      {bindPrepositions(" ")}· ориентировочно{" "}
                      {quote.estimatedDays} дн. после передачи Ozon
                    </>
                  )}
                </p>
              )}
              <div className="divider pt-1" />
              <div className="flex justify-between items-baseline">
                <span className="font-body text-caption tracking-[0.08em] uppercase text-stone-600">
                  {bindPrepositions(quote ? "Итого" : "Сумма товаров")}
                </span>
                <span className="font-display text-price text-stone-900">
                  {bindPrepositions(formatPrice(finalTotal ?? totalPrice))}
                </span>
              </div>
            </div>

            {/* Submit button на десктопе */}
            <div className="pt-2">
              {error && (
                <p className="font-body text-ui text-red-600 mt-2 mb-3">
                  {bindPrepositions(error)}
                </p>
              )}
              <button
                type="submit"
                form="checkout-form"
                disabled={pending}
                className="
                  w-full bg-stone-900 text-stone-50
                  font-body text-ui tracking-[0.08em] uppercase
                  py-4
                  hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors duration-300
                  flex items-center justify-center gap-2
                "
              >
                {pending ? (
                  <>
                    <Loader2
                      size={14}
                      strokeWidth={1.5}
                      className="animate-spin"
                    />
                    {bindPrepositions(" ")}
                    Отправляю...
                  </>
                ) : (
                  "Оформить заказ"
                )}
              </button>
            </div>

            <p className="font-body text-caption text-stone-600 leading-relaxed">
              Нажимая «Оформить заказ», вы принимаете условия
              {bindPrepositions(" ")}
              <Link
                href="/offer"
                className="underline underline-offset-2 hover:text-stone-600 transition-colors duration-200"
              >
                публичной оферты
              </Link>
              . Обработка данных заказа описана в{bindPrepositions(" ")}
              <Link
                href="/privacy"
                className="underline underline-offset-2 hover:text-stone-600 transition-colors duration-200"
              >
                политике конфиденциальности
              </Link>
              . Доставка и страховка включены в итог после расчёта.
            </p>

            <Link
              href="/catalog"
              className="block font-body text-ui tracking-[0.08em] uppercase text-stone-600 hover:text-stone-700 transition-colors duration-200"
            >
              ← Вернуться в каталог
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Field component ────────────────────────────────────────── */
function Field({
  label,
  id,
  name,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  error,
  onBlur,
}: {
  label: string;
  id: string;
  name: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  error?: string;
  onBlur?: () => void;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="font-body text-ui tracking-[0.08em] uppercase text-stone-600 block"
      >
        {bindPrepositions(label)}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? id + "-error" : undefined}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="
          w-full border border-stone-200 bg-transparent
          font-body text-ui text-stone-800
          px-4 py-3
          placeholder:text-stone-600
          focus:outline-none focus:border-stone-500
          transition-colors duration-200
        "
      />
      {error && (
        <p
          id={id + "-error"}
          role="alert"
          className="text-caption text-red-700"
        >
          {bindPrepositions(error)}
        </p>
      )}
    </div>
  );
}
