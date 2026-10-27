"use client";
import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import type { AttentionItem } from "@/lib/attention";
import { resolveAttention } from "@/lib/actions/attention";
const storageKey = "roota:review:resolved-attention:v1";
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener("roota:attention", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("roota:attention", notify);
  };
};
function snapshot() {
  try {
    return localStorage.getItem(storageKey) ?? "[]";
  } catch {
    return "[]";
  }
}
const serverSnapshot = () => "[]";
export default function AttentionBoard({
  items,
  initialResolved,
  reviewOnly,
}: {
  items: AttentionItem[];
  initialResolved: string[];
  reviewOnly: boolean;
}) {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  let local: string[] = [];
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value))
      local = value.filter((key): key is string => typeof key === "string");
  } catch {}
  const [resolved, setResolved] = useState(initialResolved);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const keys = new Set(reviewOnly ? local : resolved);
  const active = items.filter((item) => !keys.has(item.key));
  const done = items.filter((item) => keys.has(item.key));
  function toggle(key: string, value: boolean) {
    start(async () => {
      setError("");
      const next = value
        ? [...keys, key]
        : [...keys].filter((item) => item !== key);
      try {
        if (reviewOnly) {
          localStorage.setItem(storageKey, JSON.stringify(next.slice(-1000)));
          window.dispatchEvent(new Event("roota:attention"));
        } else {
          await resolveAttention(key, value);
          setResolved(next);
        }
      } catch {
        setError("Не удалось сохранить отметку. Повторите попытку.");
      }
    });
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="admin-secondary"
          aria-pressed={!showResolved}
          onClick={() => setShowResolved(false)}
        >
          Требует внимания · {active.length}
        </button>
        <button
          type="button"
          className="admin-secondary"
          aria-pressed={showResolved}
          onClick={() => setShowResolved(true)}
        >
          Решённые · {done.length}
        </button>
      </div>
      {reviewOnly && (
        <p className="text-sm text-stone-600">
          На стенде отметки сохраняются в этом браузере. Статусы заказов и
          рабочая база не меняются.
        </p>
      )}
      <p role="status">
        {error ||
          (!(showResolved ? done : active).length
            ? showResolved
              ? "Решённых задач пока нет"
              : "Срочных задач нет"
            : "")}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {(showResolved ? done : active).map((item) => (
          <article
            key={item.key}
            className="border border-stone-300 rounded-lg p-5 space-y-4"
          >
            <Link href={item.href} className="block hover:underline">
              <p className="font-medium">{item.title}</p>
              <p className="mt-2 text-sm break-words">{item.detail}</p>
            </Link>
            <button
              type="button"
              className="admin-secondary"
              disabled={pending}
              onClick={() => toggle(item.key, !showResolved)}
            >
              {showResolved ? "Вернуть в работу" : "Решено"}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
