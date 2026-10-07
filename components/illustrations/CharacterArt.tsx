import Image from "next/image";

export type Character = "skater" | "resting" | "flower" | "watering" | "walker";

/** Decorative cutouts from the studio's illustrated character sheet. */
export default function CharacterArt({
  character,
  className = "",
}: {
  character: Character;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={`pointer-events-none ${className}`}>
      <div className="relative h-full w-full">
        <Image
          src={`/images/characters/${character}.png`}
          alt=""
          fill
          sizes="(max-width: 768px) 180px, 280px"
          className="object-contain"
        />
      </div>
    </div>
  );
}
