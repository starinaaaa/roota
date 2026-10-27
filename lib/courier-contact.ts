import { z } from "zod";

export const contactChannels = {
  telegram: "Telegram",
  email: "Почта",
  instagram: "Instagram",
} as const;
export type ContactChannel = keyof typeof contactChannels;
export const courierChannel = z.enum(["telegram", "email", "instagram"]);
export const courierContactFields = {
  contactChannel: courierChannel.optional(),
  contactValue: z.string().trim().max(254).optional().default(""),
};
export function validCourierContact(
  channel: ContactChannel | undefined,
  value: string,
) {
  if (channel === "email")
    return (
      z.email().safeParse(value).success &&
      /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value)
    );
  if (channel === "telegram")
    return /^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(value);
  if (channel === "instagram")
    return /^@(?!.*\.\.)(?!\.)(?!.*\.$)[a-zA-Z0-9_.]{1,30}$/.test(value);
  return false;
}
export function contactForChannel(
  channel: ContactChannel,
  form: { telegram?: string; email?: string },
) {
  return channel === "email"
    ? (form.email ?? "")
    : channel === "telegram" && form.telegram
      ? `@${form.telegram.replace(/^@+/, "")}`
      : "";
}
export function courierContactLabel(
  details:
    | { coordination?: string; contact?: string; telegram?: string }
    | null
    | undefined,
) {
  const channel = details?.coordination as ContactChannel;
  return `${contactChannels[channel] ?? "Telegram"}${details?.contact ? `: ${details.contact}` : details?.telegram ? `: @${details.telegram.replace(/^@/, "")}` : ""}`;
}
