"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
export default function OrderPageControls({
  confirmationUrl,
}: {
  confirmationUrl: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return (
    <div className="flex flex-wrap items-center gap-4 font-body text-ui text-stone-600">
      <button
        type="button"
        className="underline underline-offset-4"
        onClick={() => router.refresh()}
      >
        Обновить статус
      </button>
      <button
        type="button"
        className="underline underline-offset-4"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              window.location.origin + window.location.pathname,
            );
            setMessage("Ссылка скопирована");
          } catch {
            setMessage("Скопируйте ссылку из адресной строки");
          }
        }}
      >
        Сохранить ссылку
      </button>
      <Link
        href={confirmationUrl}
        prefetch={false}
        className="underline underline-offset-4"
      >
        Подтверждение покупки
      </Link>
      <span role="status">{message}</span>
    </div>
  );
}
