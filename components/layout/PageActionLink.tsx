import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { bindPrepositions } from "@/lib/typography";

export default function PageActionLink({
  label,
  value,
  href,
  external = false,
}: {
  label: string;
  value: string;
  href: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      prefetch={external ? false : undefined}
      className="group grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-2 border-y border-stone-200 py-7 text-stone-900 transition-colors hover:text-stone-600 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_auto] md:gap-x-10 md:py-9"
    >
      <span className="col-span-2 font-body text-ui text-stone-600 md:col-span-1">
        {bindPrepositions(label)}
      </span>
      <span className="min-w-0 font-display text-price max-[360px]:text-[18px] [overflow-wrap:anywhere]">
        {bindPrepositions(value)}
      </span>
      <ArrowUpRight
        aria-hidden="true"
        strokeWidth={1}
        className="h-6 w-6 shrink-0 motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
      />
    </Link>
  );
}
