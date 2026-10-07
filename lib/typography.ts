/** Keep short Russian prepositions/conjunctions with the word that follows.
 * Applied to rendered copy only: URLs, form values and stored content stay intact.
 * Explicit paragraph breaks are preserved.
 */
export function bindPrepositions<T extends string | null | undefined>(
  text: T,
): T {
  if (typeof text !== "string") return text;
  const shortWord =
    /(^|[^\p{L}\p{N}_])((?:в|во|на|к|ко|с|со|у|о|об|обо|от|до|по|за|из|без|для|под|над|при|про|а|и|но|не|ни))[ \t]+(?=\S)/giu;
  let result: string = text;
  let previous: string;
  do {
    previous = result;
    result = result.replace(shortWord, "$1$2\u00a0");
  } while (result !== previous);
  return result as T;
}
