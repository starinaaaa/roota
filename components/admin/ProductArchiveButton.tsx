"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setProductArchived } from "@/lib/actions/product-archive";

export default function ProductArchiveButton({
  id,
  name,
  archived,
}: {
  id: string;
  name: string;
  archived: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="admin-secondary"
        disabled={pending}
        aria-label={`${archived ? "Восстановить" : "Удалить"} ${name}`}
        onClick={() => {
          if (
            !archived &&
            !window.confirm(
              `Удалить «${name}»? Товар будет убран с витрины и перемещён в архив. Заказы сохранятся. Товар можно восстановить.`,
            )
          )
            return;
          start(async () => {
            setError("");
            try {
              const result = await setProductArchived(id, archived);
              if (result.error) setError(result.error);
              else router.refresh();
            } catch {
              setError("Не удалось сохранить. Повторите попытку.");
            }
          });
        }}
      >
        {pending ? "Сохраняю…" : archived ? "Восстановить" : "Удалить"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
