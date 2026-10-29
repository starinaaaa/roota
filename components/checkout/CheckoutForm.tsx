"use client";

import CourierAddress from "./CourierAddress";

import { contactChannels, contactForChannel, type ContactChannel } from "@/lib/courier-contact";
import { checkoutIssue } from "@/lib/analytics/checkout-errors";
import PreorderNotice from "@/components/product/PreorderNotice";
import { productionEstimate } from "@/lib/preorder-copy";
import { productTitle } from "@/lib/product-title";
import GardenCartItem from "@/components/garden/GardenCartItem";

import { trackCheckoutProgress } from "@/lib/analytics/checkout-client";
import { bindPrepositions } from "@/lib/typography";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/ui/StoreImage";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/format-price";
import { createOrder } from "@/lib/actions/orders";
import type { CartItem, CheckoutFormData } from "@/types";

import { touchCheckoutEmail } from "@/lib/actions/email";
import { useCheckoutContactDraft } from "./useCheckoutContactDraft";
import EmailConsent from "./EmailConsent";
import PhoneField from "./PhoneField";
import DeliverySelector from "./DeliverySelector";
import { LEGAL_VERSION } from "@/lib/legal";
import { checkoutSchema } from "@/lib/validation";
import type { DeliveryQuote } from "@/lib/delivery/model";
import { deliveryEstimateLabel } from "@/lib/delivery/model";
import { COURIER_DESCRIPTION } from "@/lib/shop-policies";

import {
  readCheckoutDraft,
  type CheckoutDeliveryDraft,
} from "@/lib/checkout-draft";

type Props = {
  initialItems: CartItem[];
  deliveryEnabled: boolean;
  draftKey: string;
  reviewOnly?: boolean;
  preorderReadyOn: string | null;
};

export default function CheckoutForm({
  initialItems,
  deliveryEnabled,
  draftKey,
  reviewOnly = false,
  preorderReadyOn,
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
    contactValue: "",
    phone: "+7",
    email: "",
    deliveryType: "russia",
    deliveryMethod: "ozon_point",
    address: "",
    comment: "",
    legalVersion: LEGAL_VERSION,
    acceptedTerms: true,
    newsletterDataConsent: true,
    subscribeToNews: true,
    reviewConsent: false,
    splitShipments: false,
    emailConsent: false,
  });

  const canSplitShipments = initialItems.some(i=>i.purchase_mode === "preorder") && initialItems.some(i=>i.purchase_mode !== "preorder");
  useEffect(() => {
    let restoredMethod: "ozon_point" | "yandex_courier" = "ozon_point";
    try {
      const draft = readCheckoutDraft(localStorage.getItem(storageKey));
      if (draft) {
        restoredMethod = draft.deliveryMethod;
        setFormData((prev) => ({
          ...prev,
          firstName: draft.firstName,
          lastName: draft.lastName,
          name: `${draft.firstName} ${draft.lastName}`.trim(),
          phone: draft.phone,
          email: draft.email,
          telegram: draft.telegram,
          contactChannel: draft.contactChannel,
          contactValue: draft.contactValue,
          comment: draft.comment,
          deliveryMethod: draft.deliveryMethod,
          splitShipments: draft.splitShipments && canSplitShipments,
          deliveryType:
            draft.deliveryMethod === "yandex_courier" ? "moscow" : "russia",
          address:
            draft.deliveryMethod === "yandex_courier" ? draft.address : "",
          emailConsent: draft.emailConsent,
        }));
        setConsentEmail(draft.email);
        initialDelivery.current = draft.delivery;
        setDeliveryDraft(draft.delivery);
      }
    } catch {
      /* Private browsing or disabled storage must not prevent checkout. */
    }
    trackCheckoutProgress({ stage: "checkout_opened", method: restoredMethod });
    setDraftReady(true);
  }, [storageKey, canSplitShipments]);
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
          contactChannel: formData.contactChannel,
          contactValue: formData.contactValue,
          comment: formData.comment,
          emailConsent: false,
          delivery: deliveryDraft,
          deliveryMethod: formData.deliveryMethod,
          address: formData.address,
          splitShipments: formData.splitShipments,
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

  const contactData = useMemo(
    () => ({
      firstName: formData.firstName,
      lastName: formData.lastName,
      phone: formData.phone,
      email: formData.email ?? "",
      telegram: formData.telegram ?? "",
      contactChannel: formData.contactChannel,
      contactValue: formData.contactValue ?? "",
      address: formData.address ?? "",
      comment: formData.comment ?? "",
      deliveryMethod: formData.deliveryMethod ?? "ozon_point",
      delivery: deliveryDraft,
    }),
    [
      formData.firstName,
      formData.lastName,
      formData.phone,
      formData.email,
      formData.telegram,
      formData.contactChannel,
      formData.contactValue,
      formData.address,
      formData.comment,
      formData.deliveryMethod,
      deliveryDraft,
    ],
  );
  const contactDraft = useCheckoutContactDraft(
    contactData,
    draftReady && !pending && !reviewOnly,
  );

  const totalPrice = initialItems.reduce(
    (sum, i) => sum + i.product.price * i.quantity,
    0,
  );
  const courier = formData.deliveryMethod === "yandex_courier";

  function selectDelivery(method: "ozon_point" | "yandex_courier") {
    trackCheckoutProgress({ stage: "delivery_started", method });
    setQuote(null);
    setFormData((prev) => ({
      ...prev,
      deliveryMethod: method,
      deliveryType: method === "yandex_courier" ? "moscow" : "russia",
      deliveryQuoteId: undefined,
      splitShipments: method === "yandex_courier" ? false : prev.splitShipments,
      address: "",
    }));
    setFieldErrors({});
    setError(null);
    requestKey.current = null;
  }

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
    if (name === "contactValue" && formData.contactChannel !== "email" && value && !value.startsWith("@")) next.contactValue = `@${value}`;
    if (name === "email") {
      next.emailConsent = false;
      setConsentEmail("");
    }
    setFormData(next);
    if (fieldErrors[name]) {
      const parsed = checkoutSchema.safeParse(next);
      if (parsed.success || !parsed.error.issues.some((i) => i.path[0] === name)) trackCheckoutProgress({ stage: "error_corrected", method: formData.deliveryMethod!, ...checkoutIssue({ path: [name], code: "custom" }) });
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
    if (next) {
      trackCheckoutProgress({
        stage: "delivery_quote_seen",
        method: "ozon_point",
        quote: next.id,
      });
      setError(null);
    }
  }
  function validateField(name: string) {
    const parsed = checkoutSchema.safeParse(formData);
    const message = parsed.success
      ? ""
      : (parsed.error.issues.find((i) => i.path[0] === name)?.message ?? "");
    if (message) {
      const issue = !parsed.success && parsed.error.issues.find((i) => i.path[0] === name);
      if (issue) trackCheckoutProgress({ stage: "validation_error", method: formData.deliveryMethod!, ...checkoutIssue(issue) });
    } else if (fieldErrors[name]) trackCheckoutProgress({ stage: "error_corrected", method: formData.deliveryMethod!, ...checkoutIssue({ path: [name], code: "custom" }) });
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
    [Boolean(formData.splitShipments), initialItems.map((i) => [
      i.product_id,
      i.id,
      i.configuration,
      i.quantity,
      i.product.price,
      i.purchase_mode,
    ])],
  );
  useEffect(() => {
    if (reviewOnly) return;
    const timer = setTimeout(() => {
      void touchCheckoutEmail().catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [formData, cartKey, reviewOnly]);
  const finalTotal = courier
    ? totalPrice
    : quote
      ? Math.round((totalPrice + quote.totalCost) * 100) / 100
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reviewOnly || submitting.current) return;
    const validated = checkoutSchema.safeParse({
      ...formData,
      address: courier
        ? formData.address
        : (quote?.point.address ?? "Пункт ещё не выбран"),
    });
    if (!validated.success) {
      for (const issue of validated.error.issues) trackCheckoutProgress({ stage: "validation_error", method: formData.deliveryMethod!, ...checkoutIssue(issue) });
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
    if ((!courier && !quote) || finalTotal === null) {
      trackCheckoutProgress({
        stage: "validation_error",
        method: "ozon_point",
        field: "deliveryQuoteId",
        code: "QUOTE_REQUIRED",
      });
      setError("Выберите пункт выдачи и рассчитайте доставку.");
      return;
    }

    submitting.current = true;
    requestKey.current ??= crypto.randomUUID();
    setPending(true);
    setError(null);

    // The server reads the cart and verifies the total; no items are trusted from the browser.
    let result;
    try {
      result = await createOrder(formData, requestKey.current, finalTotal);
    } catch {
      result = {
        code: "NETWORK_ERROR",
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
      if (
        !courier &&
        /достав|упаков|Корзина|Цена изменилась/i.test(result.error)
      )
        receiveQuote(null);
      trackCheckoutProgress({
        stage: "order_error",
        method: formData.deliveryMethod!,
        code: result.code ?? "NETWORK_ERROR",
        field: result.field as import("@/lib/analytics/checkout-errors").CheckoutErrorField | undefined,
      });
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
    <div className="w-full px-6 pb-12 pt-9 md:px-12 md:pb-16 md:pt-14 lg:px-16">
      <h1 className="font-display text-page text-stone-900 mb-9 md:mb-12">
        Оформление заказа
      </h1>

      <div className="lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-12 xl:gap-16">
        {/* ── Форма ──────────────────────────────────────────── */}
        <form
          id="checkout-form"
          onSubmit={handleSubmit}
          onBlurCapture={contactDraft.flush}
          className="space-y-8"
          noValidate
        >
          <fieldset disabled={pending} className="space-y-8">
            {/* Контактные данные */}
            <fieldset className="space-y-5">
              <legend className="font-display text-price text-stone-900 mb-6">
                Контактные данные
              </legend>
              {contactDraft.error && (
                <p
                  role="status"
                  className="font-body text-caption text-stone-600"
                >
                  {contactDraft.error}
                </p>
              )}

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
                  if (formData.deliveryMethod !== "yandex_courier") {
                    receiveQuote(null);
                  }
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
                required={false}
              />
            </fieldset>

            <div className="divider" />

            <fieldset className="space-y-3">
              <legend className="font-display text-price text-stone-900 mb-5">
                Способ доставки
              </legend>
              {(
                [
                  [
                    "ozon_point",
                    "В пункт выдачи Ozon",
                    "Стоимость рассчитывается после выбора пункта.",
                  ],
                  [
                    "yandex_courier",
                    "Курьером Яндекс Доставки",
                    "Москва и Подмосковье. Напишем в выбранном канале в течение суток. Курьер оплачивается покупателем в приложении Яндекс Доставки, отдельно от изделий.",
                  ],
                ] as const
              ).map(([value, title, description]) => (
                <label
                  key={value}
                  className={`flex items-start gap-3 p-4 border cursor-pointer transition-colors hover:border-stone-500 ${formData.deliveryMethod === value ? "border-stone-900" : "border-stone-200"}`}
                >
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value={value}
                    checked={formData.deliveryMethod === value}
                    onChange={() => selectDelivery(value)}
                    className="mt-1 accent-stone-900"
                  />
                  <span className="font-body text-ui">
                    <span className="block">{title}</span>
                    <span className="block mt-2 text-caption text-stone-600">
                      {description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {courier ? (
              <div className="space-y-3">
                <fieldset className="space-y-3">
                  <legend className="font-body text-ui">Где согласовать доставку? *</legend>
                  <div className="flex flex-wrap gap-4">
                    {Object.entries(contactChannels).map(([channel, label]) => <label key={channel} className="flex items-center gap-2 font-body text-ui">
                      <input type="radio" name="contactChannel" value={channel} checked={formData.contactChannel === channel}
                        onChange={() => { setFormData(prev => ({ ...prev, contactChannel: channel as ContactChannel, contactValue: contactForChannel(channel as ContactChannel, prev) })); setFieldErrors(prev => ({ ...prev, contactValue: "" })); }} />{label}
                    </label>)}
                  </div>
                  {formData.contactChannel && <Field label={`${contactChannels[formData.contactChannel]} для связи *`} id="contactValue" name="contactValue"
                    type={formData.contactChannel === "email" ? "email" : "text"} value={formData.contactValue ?? ""}
                    onChange={handleChange} onBlur={() => validateField("contactValue")} error={fieldErrors.contactValue}
                    placeholder={formData.contactChannel === "email" ? "example@email.com" : "@username"} required />}
                  {!formData.contactChannel && fieldErrors.contactValue && <p role="alert" className="text-red-700 text-caption">{fieldErrors.contactValue}</p>}
                </fieldset>
                <CourierAddress value={formData.address ?? ""} error={fieldErrors.address}
                  onChange={address=>{setFormData(prev=>({...prev,address}));setFieldErrors(prev=>({...prev,address:""}));requestKey.current=null;}} />
                <p className="font-body text-caption text-stone-600">
                  {COURIER_DESCRIPTION}
                </p>
              </div>
            ) : (
              <DeliverySelector
                phone={formData.phone}
                splitShipments={formData.splitShipments}
                cartKey={cartKey}
                enabled={deliveryEnabled && !reviewOnly}
                onQuote={receiveQuote}
                initialSelection={initialDelivery.current}
                onSelection={saveDeliveryDraft}
              />
            )}

            {/* Комментарий */}
            <div className="space-y-2">
              <label
                htmlFor="comment"
                className="font-display text-price text-stone-900 block"
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
        <aside
          aria-labelledby="checkout-summary-heading"
          className="min-w-0 mt-12 lg:mt-0"
        >
          <div className="space-y-7 md:space-y-8">
            <h2
              id="checkout-summary-heading"
              className="font-display text-price text-stone-900"
            >
              Ваш заказ
            </h2>

            {/* Товары */}
            <div className="space-y-0">
              {initialItems.map((item) => item.configuration ? <GardenCartItem key={item.id} item={item} /> : (
                <div
                  key={item.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-5 border-b border-stone-200 first:pt-0 last:border-b-0 md:gap-x-5"
                >
                  <div className="relative aspect-square w-20 bg-stone-100 shrink-0 overflow-hidden store-media md:w-24">
                    {item.product.images[0] && (
                      <Image
                        src={item.product.images[0]}
                        alt={item.product.name}
                        fill
                        className="object-contain"
                        sizes="(min-width: 768px) 96px, 80px"
                      />
                    )}
                  </div>
                  <div className="flex flex-col justify-center flex-1 min-w-0">
                    <p className="font-body text-copy text-stone-900 break-words">
                      {bindPrepositions(productTitle(item.product.name, item.product.category))}
                    </p>
                    <p className="font-body text-copy text-stone-600 mt-1">
                      × {item.quantity}
                    </p>
                    {item.purchase_mode === "preorder" && (
                      <p className="mt-2 text-ui font-medium text-[#526444]">
                        Предзаказ · {productionEstimate(item.product.lead_time_days)}
                      </p>
                    )}
                  </div>
                  <p className="font-body text-copy text-stone-900 tabular-nums whitespace-nowrap">
                    {bindPrepositions(
                      formatPrice(item.product.price * item.quantity),
                    )}
                  </p>
                </div>
              ))}
            </div>

            {!courier && canSplitShipments && (
              <label className="flex items-start gap-3 font-body text-ui">
                <input type="checkbox" checked={Boolean(formData.splitShipments)} onChange={e=>{
                  const splitShipments=e.target.checked;setQuote(null);setFormData(prev=>({...prev,splitShipments,deliveryQuoteId:undefined}));requestKey.current=null;
                }} className="mt-1" />
                <span>Хочу получить посылки раздельно быстрее
                  <span className="block text-caption text-stone-600 mt-1">Готовые изделия отправим отдельно, предзаказ — после изготовления. Стоимость всех посылок рассчитаем до оплаты.</span>
                </span>
              </label>
            )}
            {initialItems.some(i => i.purchase_mode === "preorder") && (
              <PreorderNotice
                days={Math.max(0, ...initialItems.filter(i => i.purchase_mode === "preorder").map(i => i.product.lead_time_days ?? 0))}
                readyOn={preorderReadyOn}
                splitDispatch={Boolean(formData.splitShipments) && !courier}
              />
            )}
            {/* Итого */}
            <div className="space-y-4">
              <div className="flex justify-between gap-6">
                <span className="font-body text-copy text-stone-600">
                  Товары
                </span>
                <span className="font-body text-copy text-stone-900 tabular-nums whitespace-nowrap">
                  {bindPrepositions(formatPrice(totalPrice))}
                </span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="font-body text-copy text-stone-600">
                  Доставка
                </span>
                <span className="font-body text-ui text-stone-600 text-right tabular-nums">
                  {bindPrepositions(
                    courier
                      ? "оплачивается отдельно"
                      : quote
                        ? formatPrice(quote.totalCost)
                        : "нужен расчёт",
                  )}
                </span>
              </div>
              {quote && (
                <p className="font-body text-ui text-stone-600">
                  {bindPrepositions(deliveryEstimateLabel(quote.estimatedDays))}
                </p>
              )}
              <div className="flex justify-between items-baseline gap-5 border-t border-stone-200 pt-6 md:pt-7">
                <span className="font-body text-ui tracking-[0.08em] uppercase text-stone-600">
                  {bindPrepositions(
                    courier
                      ? "К оплате за изделия"
                      : quote
                        ? "Итого"
                        : "Сумма товаров",
                  )}
                </span>
                <span className="font-display text-[2rem] leading-none md:text-section text-stone-900 tabular-nums whitespace-nowrap">
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
                      required
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
                      </Link>
                      ; ознакомлен с{" "}
                      <Link
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        политикой конфиденциальности и обработки данных
                      </Link>
                      . <span aria-hidden="true">*</span>
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
                  reviewOnly={reviewOnly}
                  email={consentEmail}
                  serviceConsent={formData.acceptedTerms}
                  marketingConsent={formData.subscribeToNews}
                  onChange={(marketingConsent) => {
                    setConsentEmail(formData.email);
                    setFieldErrors((prev) => ({
                      ...prev,
                      newsletterDataConsent: "",
                    }));
                    setFormData((prev) => ({
                      ...prev,
                      newsletterDataConsent: marketingConsent,
                      subscribeToNews: marketingConsent,
                      emailConsent: prev.acceptedTerms,
                    }));
                  }}
                />
                {fieldErrors.newsletterDataConsent && (
                  <p
                    role="alert"
                    className="font-body text-caption text-red-700"
                  >
                    {fieldErrors.newsletterDataConsent}
                  </p>
                )}
              </fieldset>
              {Object.values(fieldErrors).some(Boolean) && <ul className="space-y-2 text-red-700 text-ui" aria-label="Ошибки оформления">
                {Object.entries(fieldErrors).filter(([, message]) => message).map(([field, message]) => <li key={field}><a href={`#${field}`} onClick={() => document.getElementById(field)?.focus()} className="underline">{message}</a></li>)}
              </ul>}
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
                disabled={pending || reviewOnly}
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
        </aside>
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
