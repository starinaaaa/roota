"use client";
import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { saveSite } from "@/lib/actions/site";
import { uploadImage } from "@/lib/actions/admin";
import type { SiteContent } from "@/lib/site-schema";
export default function SiteEditor({
  initial,
  products,
  heroPreview,
}: {
  initial: SiteContent;
  products: { id: string; name: string; publication_status: string }[];
  heroPreview: string;
}) {
  const [data, setData] = useState(initial),
    [preview, setPreview] = useState(heroPreview),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition(),
    drag = useRef<number | null>(null);
  const textFields = [
    ["heroTitle", "Главный заголовок", 120],
    ["heroIntro", "Вводный текст", 600],
    ["studioStatement", "Заголовок блока о студии на главной", 160],
    ["studioSummary", "Текст блока о студии на главной", 600],
    ["studioTitle", "Заголовок страницы о студии", 160],
    ["studioIntro", "О студии", 2500],
    ["processText", "Процесс", 2500],
    ["materialsText", "Материалы", 2500],
    ["studioQuote", "Цитата", 600],
  ] as const;
  function move(from: number, to: number) {
    setData((v) => {
      if (to < 0 || to >= v.featuredIds.length) return v;
      const ids = [...v.featuredIds];
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      return { ...v, featuredIds: ids };
    });
  }
  function save(publish: boolean) {
    start(async () => {
      setMessage("");
      try {
        const result = await saveSite(data, publish);
        setMessage(
          result.error ??
            (publish ? "Изменения опубликованы" : "Черновик сохранён"),
        );
      } catch {
        setMessage("Не удалось сохранить. Проверьте доступ.");
      }
    });
  }
  return (
    <div className="space-y-6">
      <h2 className="text-xl">Сайт</h2>
      <p className="text-stone-600">
        Сохраните черновик, проверьте предпросмотр и опубликуйте изменения.
      </p>
      <section className="admin-card grid md:grid-cols-2 gap-5">
        {textFields.map(([key, label, max]) => (
          <label key={key} className={max > 1000 ? "md:col-span-2" : ""}>
            {label}
            <textarea
              className="admin-input"
              value={data[key]}
              onChange={(e) =>
                setData((v) => ({ ...v, [key]: e.target.value }))
              }
              rows={max > 1000 ? 6 : 3}
              maxLength={max}
            />
          </label>
        ))}
      </section>
      <section className="admin-card space-y-4">
        <h3 className="text-lg">Главное изображение</h3>
        <Image
          src={preview}
          alt="Главное изображение"
          width={640}
          height={320}
          unoptimized
          className="w-full max-w-xl h-64 object-contain"
        />
        <label className="admin-secondary cursor-pointer">
          Загрузить изображение
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              start(async () => {
                const form = new FormData();
                form.set("productId", "site");
                form.set("file", file);
                try {
                  const result = await uploadImage(form);
                  if (result.error) setMessage(result.error);
                  else if (result.image) {
                    setData((v) => ({
                      ...v,
                      heroImage: result.image.public_url,
                    }));
                    setPreview(result.image.preview_url);
                  }
                } catch {
                  setMessage("Не удалось загрузить изображение");
                }
              });
            }}
          />
        </label>
      </section>
      <section className="admin-card space-y-4">
        <h3 className="text-lg">Избранные изделия и порядок</h3>
        <select
          className="admin-input"
          value=""
          onChange={(e) => {
            if (e.target.value)
              setData((v) => ({
                ...v,
                featuredIds: [...v.featuredIds, e.target.value],
              }));
          }}
        >
          <option value="">Добавить изделие</option>
          {products
            .filter(
              (p) =>
                p.publication_status === "published" &&
                !data.featuredIds.includes(p.id),
            )
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        {data.featuredIds.map((id, n) => (
          <div
            key={id}
            className="flex flex-wrap items-center gap-2 border border-stone-200 p-3"
            draggable
            onDragStart={() => {
              drag.current = n;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag.current !== null) move(drag.current, n);
            }}
          >
            <p className="flex-1 min-w-40">
              {products.find((p) => p.id === id)?.name ?? "Недоступное изделие"}
            </p>
            <button
              className="admin-secondary"
              onClick={() => move(n, n - 1)}
              aria-label="Выше"
            >
              ↑
            </button>
            <button
              className="admin-secondary"
              onClick={() => move(n, n + 1)}
              aria-label="Ниже"
            >
              ↓
            </button>
            <button
              className="admin-secondary"
              onClick={() =>
                setData((v) => ({
                  ...v,
                  featuredIds: v.featuredIds.filter((x) => x !== id),
                }))
              }
            >
              Убрать
            </button>
          </div>
        ))}
      </section>
      <section className="admin-card grid md:grid-cols-3 gap-4">
        <h3 className="md:col-span-3 text-lg">Контакты</h3>
        {(["email", "telegram", "instagram"] as const).map((key) => (
          <label key={key}>
            {key === "email"
              ? "Email"
              : key === "telegram"
                ? "Telegram"
                : "Instagram"}
            <input
              className="admin-input"
              type={key === "email" ? "email" : "url"}
              value={data[key]}
              onChange={(e) =>
                setData((v) => ({ ...v, [key]: e.target.value }))
              }
            />
          </label>
        ))}
      </section>
      {(["delivery", "payment"] as const).map((key) => (
        <section key={key} className="admin-card space-y-5">
          <h3 className="text-lg">
            {key === "delivery" ? "Доставка" : "Оплата"}
          </h3>
          {data[key].map((item, n) => (
            <div key={n} className="grid md:grid-cols-[1fr_2fr_auto] gap-3">
              <label>
                Заголовок
                <input
                  className="admin-input"
                  maxLength={100}
                  value={item.title}
                  onChange={(e) =>
                    setData((v) => ({
                      ...v,
                      [key]: v[key].map((i, j) =>
                        j === n ? { ...i, title: e.target.value } : i,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Описание
                <textarea
                  className="admin-input"
                  rows={3}
                  maxLength={1500}
                  value={item.text}
                  onChange={(e) =>
                    setData((v) => ({
                      ...v,
                      [key]: v[key].map((i, j) =>
                        j === n ? { ...i, text: e.target.value } : i,
                      ),
                    }))
                  }
                />
              </label>
              <button
                className="admin-secondary self-end"
                onClick={() =>
                  setData((v) => ({
                    ...v,
                    [key]: v[key].filter((_, j) => j !== n),
                  }))
                }
              >
                Убрать
              </button>
            </div>
          ))}
          <button
            className="admin-secondary"
            disabled={data[key].length >= 8}
            onClick={() =>
              setData((v) => ({
                ...v,
                [key]: [...v[key], { title: "", text: "" }],
              }))
            }
          >
            Добавить пункт
          </button>
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="admin-secondary"
          disabled={pending}
          onClick={() => save(false)}
        >
          Сохранить черновик
        </button>
        <Link
          className="admin-secondary"
          href="/admin/site/preview"
          target="_blank"
        >
          Предпросмотр
        </Link>
        <button
          className="admin-button"
          disabled={pending}
          onClick={() => save(true)}
        >
          Опубликовать
        </button>
        <p role="status">{message}</p>
      </div>
    </div>
  );
}
