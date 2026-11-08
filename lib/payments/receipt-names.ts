export function plateReceiptName(name: string): string {
  const title = name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(?:керамическая\s+)?тарелка(?:\s+|$)/i, "")
    .replace(/^[«„“"']|[»“”"']$/g, "")
    .trim();
  const prefix = "Керамическая тарелка";
  return title
    ? `${prefix} «${title.slice(0, 128 - prefix.length - 3)}»`
    : prefix;
}
