import Image from "next/image";
import type { ReviewPageArtwork } from "@/lib/review-copy";

export default function ReviewIntro({
  artwork,
  title,
  introduction,
}: {
  artwork: ReviewPageArtwork;
  title: string;
  introduction?: string;
}) {
  return (
    <header className="border-b border-stone-200 pb-6">
      <Image
        src={artwork}
        alt=""
        width={560}
        height={220}
        unoptimized
        className="mb-4 h-auto w-full max-w-[340px]"
      />
      <h1 className="font-display text-[clamp(1.6rem,5vw,2.25rem)]! leading-tight! [overflow-wrap:anywhere]!">
        {title}
      </h1>
      {introduction ? (
        <div className="pt-3">
          <p className="max-w-[52ch] text-copy text-stone-700">
            {introduction}
          </p>
        </div>
      ) : null}
    </header>
  );
}
