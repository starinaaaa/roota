"use client";
import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { saveProduct, uploadImage } from "@/lib/actions/admin";
import { publicationLabels, type ProductInput } from "@/lib/validation";
import type { Category } from "@/types";
export type GalleryImage = {
  id: string;
  storage_path: string;
  public_url: string;
  bucket: "products" | "product-drafts";
  preview_url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};
type EditableProduct = ProductInput & {
  images: GalleryImage[];
  updated_at: string;
};
const empty: ProductInput = {
  name: "",
  slug: "",
  description: "",
  category_id: null,
  price: 0,
  stock_qty: 0,
  material: null,
  dimensions: null,
  weight: null,
  care: null,
  dishwasher_safe: null,
  microwave_safe: null,
  publication_status: "draft",
  preorder_enabled: false,
  lead_time_days: null,
  featured: false,
  seo_title: null,
  seo_description: null,
};
export default function ProductEditor({
  id,
  product,
  categories,
}: {
  id: string;
  product: EditableProduct | null;
  categories: Category[];
}) {
  const [data, setData] = useState<ProductInput>(
      product ? { ...empty, ...product } : empty,
    ),
    [images, setImages] = useState<GalleryImage[]>(product?.images ?? []),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition(),
    router = useRouter(),
    dragIndex = useRef<number | null>(null);
  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setData((v) => ({ ...v, [key]: value }));
  function move(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    setImages((prev) => {
      const next = [...prev];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next.map((i, n) => ({ ...i, sort_order: n }));
    });
  }
  function remove(index: number) {
    setImages((prev) => {
      const remaining = prev.filter((_, n) => n !== index);
      return remaining.map((i, n) => ({
        ...i,
        sort_order: n,
        is_primary: remaining.some((v) => v.is_primary)
          ? i.is_primary
          : n === 0,
      }));
    });
  }
  const text = (
    key:
      | "name"
      | "slug"
      | "material"
      | "dimensions"
      | "weight"
      | "seo_title"
      | "seo_description",
    label: string,
    max: number,
  ) => (
    <label key={key}>
      {label}
      <input
        className="admin-input"
        value={data[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        maxLength={max}
      />
    </label>
  );
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setMessage("");
          try {
            const result = await saveProduct(
              id,
              data,
              images.map(({ preview_url, ...image }) => {
                void preview_url;
                return image;
              }),
              product?.updated_at ?? null,
            );
            setMessage(result.error ?? "Изделие сохранено");
            if (!result.error) {
              router.replace(`/admin/products/${id}`);
              router.refresh();
            }
          } catch {
            setMessage("Не удалось сохранить. Проверьте доступ.");
          }
        });
      }}
    >
      <h2 className="text-xl">
        {product ? "Редактирование изделия" : "Новое изделие"}
      </h2>
      <section className="admin-card grid md:grid-cols-2 gap-5">
        {text("name", "Название *", 150)}
        {text("slug", "Адрес страницы *", 120)}
        <label className="md:col-span-2">
          Описание
          <textarea
            className="admin-input"
            rows={6}
            value={data.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={5000}
          />
        </label>
        <label>
          Цена, ₽
          <input
            className="admin-input"
            type="number"
            min={0}
            max={10000000}
            step={1}
            value={data.price}
            onChange={(e) => set("price", Number(e.target.value))}
          />
        </label>
        <label>
          Категория
          <select
            className="admin-input"
            value={data.category_id ?? ""}
            onChange={(e) => set("category_id", e.target.value || null)}
          >
            <option value="">Выберите категорию</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {text("material", "Материал", 300)}
        {text("dimensions", "Размеры", 300)}
        {text("weight", "Вес", 100)}
        <label>
          Доступный остаток
          <input
            className="admin-input"
            type="number"
            min={0}
            step={1}
            value={data.stock_qty}
            onChange={(e) => set("stock_qty", Number(e.target.value))}
          />
          <span className="text-sm text-stone-600">
            Резервы уже вычтены из этого количества.
          </span>
        </label>
        <label className="md:col-span-2">
          Уход за изделием
          <textarea
            className="admin-input"
            value={data.care ?? ""}
            onChange={(e) => set("care", e.target.value)}
            rows={4}
            maxLength={2000}
          />
        </label>
        {(["dishwasher_safe", "microwave_safe"] as const).map((key) => (
          <label key={key}>
            {key === "dishwasher_safe"
              ? "Посудомоечная машина"
              : "Микроволновая печь"}
            <select
              className="admin-input"
              value={data[key] === null ? "" : String(data[key])}
              onChange={(e) =>
                set(
                  key,
                  e.target.value === "" ? null : e.target.value === "true",
                )
              }
            >
              <option value="">Не указано</option>
              <option value="true">Можно</option>
              <option value="false">Нельзя</option>
            </select>
          </label>
        ))}
      </section>
      <section className="admin-card space-y-5">
        <h3 className="text-lg">Фотографии</h3>
        <p className="text-sm text-stone-600">
          JPEG, PNG, WebP до 10 МБ. Перетаскивайте фотографии или используйте
          стрелки. Снятые с изделия файлы сохраняются для восстановления.
        </p>
        <label className="admin-secondary cursor-pointer">
          Загрузить фото
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              start(async () => {
                setMessage("");
                for (const file of files) {
                  const form = new FormData();
                  form.set("productId", id);
                  form.set("file", file);
                  try {
                    const result = await uploadImage(form);
                    if (result.error) {
                      setMessage(result.error);
                      break;
                    }
                    if (result.image)
                      setImages((prev) => [
                        ...prev,
                        {
                          ...result.image,
                          sort_order: prev.length,
                          is_primary: prev.length === 0,
                        },
                      ]);
                  } catch {
                    setMessage("Не удалось загрузить фото");
                    break;
                  }
                }
              });
            }}
          />
        </label>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map((image, n) => (
            <div
              key={image.id}
              className="border border-stone-200 rounded-md p-3 space-y-3"
              draggable
              onDragStart={() => {
                dragIndex.current = n;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex.current !== null) move(dragIndex.current, n);
                dragIndex.current = null;
              }}
            >
              <Image
                src={image.preview_url || image.public_url}
                alt={image.alt_text || data.name || "Изделие"}
                width={320}
                height={240}
                className="w-full h-40 object-contain"
                unoptimized
              />
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="primary-image"
                  checked={image.is_primary}
                  onChange={() =>
                    setImages((prev) =>
                      prev.map((i) => ({
                        ...i,
                        is_primary: i.id === image.id,
                      })),
                    )
                  }
                />
                Главное фото
              </label>
              <input
                aria-label={`Описание фото ${n + 1}`}
                placeholder="Описание фото"
                className="admin-input"
                value={image.alt_text ?? ""}
                maxLength={300}
                onChange={(e) =>
                  setImages((prev) =>
                    prev.map((i) =>
                      i.id === image.id
                        ? { ...i, alt_text: e.target.value }
                        : i,
                    ),
                  )
                }
              />
              <div className="flex flex-wrap gap-2">
                <button
                  className="admin-secondary"
                  type="button"
                  onClick={() => move(n, n - 1)}
                  disabled={n === 0}
                  aria-label={`Переместить фото ${n + 1} раньше`}
                >
                  ←
                </button>
                <button
                  className="admin-secondary"
                  type="button"
                  onClick={() => move(n, n + 1)}
                  disabled={n === images.length - 1}
                  aria-label={`Переместить фото ${n + 1} позже`}
                >
                  →
                </button>
                <button
                  className="admin-secondary"
                  type="button"
                  onClick={() => remove(n)}
                >
                  Убрать
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="admin-card grid md:grid-cols-2 gap-5">
        <h3 className="md:col-span-2 text-lg">Публикация и предзаказ</h3>
        <label>
          Состояние
          <select
            className="admin-input"
            value={data.publication_status}
            onChange={(e) =>
              set(
                "publication_status",
                e.target.value as ProductInput["publication_status"],
              )
            }
          >
            {Object.entries(publicationLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={data.featured}
            onChange={(e) => set("featured", e.target.checked)}
          />
          Показать на главной
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={data.preorder_enabled}
            onChange={(e) => set("preorder_enabled", e.target.checked)}
          />
          Разрешить предзаказ
        </label>
        <label>
          Изготовление, дней
          <input
            className="admin-input"
            type="number"
            min={1}
            max={365}
            value={data.lead_time_days ?? ""}
            onChange={(e) =>
              set(
                "lead_time_days",
                e.target.value ? Number(e.target.value) : null,
              )
            }
            disabled={!data.preorder_enabled}
          />
        </label>
        <p className="md:col-span-2 text-sm text-stone-600">
          При нулевом остатке обычная покупка закрыта. Архив сохраняет историю
          заказов. Старый адрес опубликованного изделия будет перенаправлять на
          новый.
        </p>
      </section>
      <section className="admin-card grid md:grid-cols-2 gap-5">
        <h3 className="md:col-span-2 text-lg">Поиск и ссылки</h3>
        {text("seo_title", "Заголовок для поиска", 100)}
        {text("seo_description", "Описание для поиска", 300)}
        <p className="md:col-span-2 text-sm text-stone-600">
          Оставьте пустым, чтобы использовать название и описание изделия.
        </p>
      </section>
      <div className="flex flex-wrap gap-4 items-center">
        <button className="admin-button" disabled={pending}>
          {pending ? "Сохраняю…" : "Сохранить изделие"}
        </button>
        <p role="status">{message}</p>
      </div>
    </form>
  );
}
