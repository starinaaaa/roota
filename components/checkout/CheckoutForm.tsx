"use client";

import { bindPrepositions } from "@/lib/typography";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/products";
import { createOrder } from "@/lib/actions/orders";
import type { CartItem, CheckoutFormData } from "@/types";

import { touchCheckoutEmail } from "@/lib/actions/email";
import EmailConsent from "./EmailConsent";
import PhoneField from "./PhoneField";
import DeliverySelector from "./DeliverySelector";
import { LEGAL_VERSION } from "@/lib/legal";
import { checkoutSchema } from "@/lib/validation";
import type { DeliveryQuote } from "@/lib/delivery/model";

import {
  readCheckoutDraft,
  type CheckoutDeliveryDraft,
} from "@/lib/checkout-draft";

type Props = {
  initialItems: CartItem[];
  deliveryEnabled: boolean;
  draftKey: string;
};

export default function CheckoutForm({
  initialItems,
  deliveryEnabled,
  draftKey,
}: Props) {
  const router = useRouter();
  const requestKey = useRef<string | null>(null);
  const submitting = useRef(false);

  const [consentEmail, setConsentEmail] = useState("");
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftReady, setDraftReady] = useState(false);
  const [deliveryDraft, setDeliveryDraft] =
    useState<CheckoutDeliveryDraft | null>(null);
  const initialDelivery = useRef<CheckoutDeliveryDraft | null>(null);
  const storageKey = `roota:checkout:v1:${draftKey}`;
  const [formData, setFormData] = useState<
    CheckoutFormData & { firstName: string; lastName: string }
  >({
    firstName: "",
    lastName: "",
    name: "",
    telegram: "",
    phone: "+7",
    email: "",
    deliveryType: "russia",
    address: "",
    comment: "",
    legalVersion: LEGAL_VERSION,
    acceptedTerms: true,
    newsletterDataConsent: false,
    subscribeToNews: false,
    reviewConsent: false,
    emailConsent: true,
  });

  useEffect(() => {
    try {
      const draft = readCheckoutDraft(localStorage.getItem(storageKey));
      if (draft) {
        setFormData((prev) => ({
          ...prev,
          firstName: draft.firstName,
          lastName: draft.lastName,
          name: `${draft.firstName} ${draft.lastName}`.trim(),
          phone: draft.phone,
          email: draft.email,
          telegram: draft.telegram,
          comment: draft.comment,
          emailConsent: draft.emailConsent,
        }));
        setConsentEmail(draft.email);
        initialDelivery.current = draft.delivery;
        setDeliveryDraft(draft.delivery);
      }
    } catch {
      /* Private browsing or disabled storage must not prevent checkout. */
    }
    setDraftReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (!draftReady) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          savedAt: Date.now(),
          legalVersion: LEGAL_VERSION,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          email: formData.email,
          telegram: formData.telegram,
          comment: formData.comment,
          emailConsent: !!formData.emailConsent,
          delivery: deliveryDraft,
        }),
      );
    } catch {
      /* Checkout also works without local storage. */
    }
  }, [draftReady, storageKey, formData, deliveryDraft]);
  const saveDeliveryDraft = useCallback(
    (value: CheckoutDeliveryDraft) => setDeliveryDraft(value),
    [],
  );

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
    const next = {
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    };
    if (name === "firstName" || name === "lastName")
      next.name = `${next.firstName.trim()} ${next.lastName.trim()}`.trim();
    if (name === "telegram") next.telegram = value.replace(/^@+/, "");
    setFormData(next);
    if (name === "email") setConsentEmail("");
    if (fieldErrors[name]) {
      const parsed = checkoutSchema.safeParse(next);
      setFieldErrors((prev) => ({
        ...prev,
        [name]: parsed.success
          ? ""
          : (parsed.error.issues.find((i) => i.path[0] === name)?.message ??
            ""),
      }));
    }
    setError(null);
  }

  function receiveQuote(next: DeliveryQuote | null) {
    setQuote(next);
    setFormData((prev) => ({
      ...prev,
      deliveryQuoteId: next?.id,
      address: next?.point.address ?? "",
    }));
    if (next) setError(null);
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
  useEffect(() => {
    const timer = setTimeout(() => {
      void touchCheckoutEmail().catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [formData, cartKey]);
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
    setFieldErrors({});
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
      try {
        localStorage.removeItem(storageKey);
      } catch {}
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

  if (!draftReady)
    return (
      <p role="status" className="px-6 py-12 text-ui">
        Загружаем данные заказа…
      </p>
    );

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

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  error={fieldErrors.firstName}
                  onBlur={() => validateField("firstName")}
                  label="Имя *"
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="Анна"
                  autoComplete="given-name"
                  required
                />
                <Field
                  error={fieldErrors.lastName}
                  onBlur={() => validateField("lastName")}
                  label="Фамилия *"
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="Иванова"
                  autoComplete="family-name"
                  required
                />
              </div>

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
                onBlur={() => {
                  validateField("email");
                  setConsentEmail(formData.email);
                }}
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
              <Field
                label="Telegram"
                id="telegram"
                name="telegram"
                type="text"
                value={formData.telegram}
                onChange={handleChange}
                onBlur={() => validateField("telegram")}
                error={fieldErrors.telegram}
                placeholder="anna_ceramics"
                prefix="@"
                autoComplete="off"
              />
            </fieldset>

            <div className="divider" />

            <DeliverySelector
              phone={formData.phone}
              cartKey={cartKey}
              enabled={deliveryEnabled}
              onQuote={receiveQuote}
              initialSelection={initialDelivery.current}
              onSelection={saveDeliveryDraft}
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
                placeholder="Пожелания к заказу"
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
              {quote?.estimatedDays != null && (
                <p className="font-body text-caption text-stone-600">
                  Ориентировочно {quote.estimatedDays} дн. после передачи Ozon
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
              <fieldset disabled={pending} className="space-y-4 mb-5">
                <div className="font-body text-caption text-stone-600 leading-relaxed">
                  <div className="flex items-start gap-3">
                    <input
                      id="acceptedTerms"
                      form="checkout-form"
                      type="checkbox"
                      name="acceptedTerms"
                      checked={formData.acceptedTerms}
                      onChange={handleChange}
                      aria-describedby={
                        fieldErrors.acceptedTerms
                          ? "acceptedTerms-error"
                          : undefined
                      }
                      aria-invalid={Boolean(fieldErrors.acceptedTerms)}
                      className="mt-1 w-4 h-4 shrink-0 accent-stone-900"
                    />
                    <label htmlFor="acceptedTerms" className="cursor-pointer">
                      Принимаю{" "}
                      <Link
                        href="/offer"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        условия покупки
                      </Link>{" "}
                      и{" "}
                      <Link
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        соглашение
                      </Link>
                      ; ознакомлен с{" "}
                      <Link
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        политикой конфиденциальности
                      </Link>{" "}
                      и{" "}
                      <Link
                        href="/personal-data-policy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        обработкой данных
                      </Link>
                      .
                    </label>
                  </div>
                  {fieldErrors.acceptedTerms && (
                    <p
                      id="acceptedTerms-error"
                      role="alert"
                      className="mt-2 text-red-600"
                    >
                      {fieldErrors.acceptedTerms}
                    </p>
                  )}
                </div>
                <EmailConsent
                  email={consentEmail}
                  checked={!!formData.emailConsent}
                  onChange={(checked) => {
                    setConsentEmail(formData.email);
                    setFormData((prev) => ({ ...prev, emailConsent: checked }));
                  }}
                />
              </fieldset>
              {error && (
                <p
                  role="alert"
                  className="font-body text-ui text-red-600 mt-2 mb-3"
                >
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
  prefix,
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
  prefix?: string;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="font-body text-ui tracking-[0.08em] uppercase text-stone-600 block"
      >
        {bindPrepositions(label)}
      </label>
      <div
        className={
          prefix
            ? "flex items-baseline border border-stone-200 px-4 focus-within:border-stone-500 transition-colors duration-200"
            : undefined
        }
      >
        {prefix && (
          <span
            aria-hidden="true"
            className="shrink-0 font-body text-ui text-stone-600 pointer-events-none"
          >
            {prefix}
          </span>
        )}
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
          className={
            prefix
              ? "w-full min-w-0 border-0 bg-transparent font-body text-ui text-stone-800 pl-0 py-3 placeholder:text-stone-600 focus:outline-none"
              : `
          w-full border border-stone-200 bg-transparent
          font-body text-ui text-stone-800
          px-4 py-3
          placeholder:text-stone-600
          focus:outline-none focus:border-stone-500
          transition-colors duration-200
        `
          }
        />
      </div>
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
