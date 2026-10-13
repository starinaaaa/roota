import "server-only";
import { emailProviderKey } from "./provider-config";
import { sendUnisenderEmail, type EmailMessage } from "./unisender-transport";

export async function sendEmail(message: EmailMessage, kind = "order_created") {
  if (process.env.CUSTOMER_EMAILS_ENABLED !== "true")
    return { state: "disabled" as const };
  const key = emailProviderKey(kind, process.env);
  if (!key) return { state: "unconfigured" as const };
  return sendUnisenderEmail(key, message);
}
