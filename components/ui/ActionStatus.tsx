"use client";

import { useEffect, useState } from "react";

function Notice({ message, pending }: { message: string; pending: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (pending) return;
    const timer = setTimeout(() => setDismissed(true), 8000);
    return () => clearTimeout(timer);
  }, [pending]);
  if (dismissed) return null;
  return (
    <aside
      aria-label="Результат действия"
      className="fixed top-24 right-4 left-4 sm:left-auto sm:w-96 z-[110] border border-stone-300 rounded-lg bg-stone-50 text-stone-900 p-4 shadow-lg flex items-start gap-3"
    >
      {pending && (
        <span className="action-spinner mt-1 shrink-0" aria-hidden="true" />
      )}
      <p className="flex-1 text-sm">{message}</p>
      {!pending && (
        <button
          type="button"
          aria-label="Закрыть уведомление"
          className="px-2 text-lg leading-none"
          onClick={() => setDismissed(true)}
        >
          ×
        </button>
      )}
    </aside>
  );
}

export default function ActionStatus({
  message,
  pending = false,
  pendingLabel = "Выполняю…",
}: {
  message: string;
  pending?: boolean;
  pendingLabel?: string;
}) {
  const text = pending ? pendingLabel : message;
  return (
    <>
      <p role="status" aria-atomic="true" className="text-sm self-center">
        {text}
      </p>
      {text && (
        <Notice key={`${pending}-${text}`} message={text} pending={pending} />
      )}
    </>
  );
}
