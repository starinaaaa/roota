"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";

export default function SubmitButton({
  children,
  pendingLabel = "Выполняю…",
  disabled,
  ...props
}: ComponentProps<"button"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
