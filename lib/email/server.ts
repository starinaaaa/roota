import "server-only";
import { sendUnisenderEmail, type EmailMessage } from "./unisender-transport";

export async function sendEmail(message: EmailMessage) {
  if (process.env.CUSTOMER_EMAILS_ENABLED !== "true")
    return { state: "disabled" as const };
  const key = process.env.UNISENDER_GO_API_KEY;
  if (!key) return { state: "unconfigured" as const };
  return sendUnisenderEmail(key, message);
}
