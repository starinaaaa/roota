export function normalizeRussianPhone(value: string): string | null {
  const text = value.trim();
  if (
    !/^[+\d\s()\-]+$/.test(text) ||
    (text.includes("+") &&
      (!text.startsWith("+") || text.indexOf("+", 1) !== -1))
  )
    return null;
  let digits = text.replace(/\D/g, "");
  if (text.startsWith("+") && !digits.startsWith("7")) return null;
  if (digits.length === 10 && !text.startsWith("+")) digits = "7" + digits;
  if (digits.length === 11 && digits.startsWith("8") && !text.startsWith("+"))
    digits = "7" + digits.slice(1);
  return /^7\d{10}$/.test(digits) ? "+" + digits : null;
}
export function formatRussianPhone(digits: string) {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  if (!d) return "+7";
  let text = "+7 (" + d.slice(0, 3);
  if (d.length >= 3) text += ")";
  if (d.length > 3) text += " " + d.slice(3, 6);
  if (d.length > 6) text += "-" + d.slice(6, 8);
  if (d.length > 8) text += "-" + d.slice(8, 10);
  return text;
}
