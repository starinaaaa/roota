"use client";
import { usePathname } from "next/navigation";
export default function ReviewAdminContent({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <fieldset disabled={usePathname() !== "/admin"} className="min-w-0">
      {children}
    </fieldset>
  );
}
