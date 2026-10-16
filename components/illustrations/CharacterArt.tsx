import Image from "next/image";
import images from "@/lib/character-image-manifest.json";

export type Character = "skater" | "resting" | "flower" | "watering" | "walker";

/** Decorative cutouts from the studio's illustrated character sheet. */
export default function CharacterArt({
  character,
  className = "",
  loading = "lazy",
}: {
  character: Character;
  className?: string;
  loading?: "lazy" | "eager";
}) {
  return (
    <div aria-hidden="true" className={`pointer-events-none ${className}`}>
      <div className="relative h-full w-full">
        <Image
          src={images[character]}
          unoptimized
          loading={loading}
          fetchPriority="low"
          alt=""
          fill
          sizes="(max-width: 768px) 180px, 280px"
          className="object-contain"
        />
      </div>
    </div>
  );
}
