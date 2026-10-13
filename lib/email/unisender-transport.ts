// Used by server code and the explicit connection test. Never import into client components.
export type EmailResult =
  | { state: "accepted"; jobId: string }
  | { state: "rejected"; code?: number; httpStatus?: number }
  | { state: "unknown" };

export interface EmailMessage {
  to: string;
  unsubscribeUrl?: string;
  transactional?: boolean;
  metadata?: Record<string, string>;
  subject: string;
  html: string;
  plaintext: string;
  // Stable per event. Provider deduplication lasts only one minute;
  // a persistent outbox must still guard against retries after that interval.
  idempotenceKey: string;
}

export async function sendUnisenderEmail(
  apiKey: string,
  message: EmailMessage,
  request: typeof fetch = fetch,
): Promise<EmailResult> {
  if (
    !apiKey ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to) ||
    !message.idempotenceKey ||
    message.idempotenceKey.length > 64 ||
    /[\r\n]/.test(message.subject) ||
    !message.subject ||
    !message.html ||
    !message.plaintext
  )
    return { state: "rejected" };

  try {
    const response = await request(
      "https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          message: {
            recipients: [{ email: message.to, metadata: message.metadata }],
            track_links: 0,
            track_read: 0,
            ...(message.unsubscribeUrl
              ? {
                  headers: {
                    "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
                  },
                }
              : {}),
            from_email: "hello@roota.moscow",
            from_name: "ROOTA",
            reply_to: "hello@roota.moscow",
            reply_to_name: "ROOTA",
            subject: message.subject,
            body: { html: message.html, plaintext: message.plaintext },
            template_engine: "none",
            global_language: "ru",
            idempotence_key: message.idempotenceKey,
            // Marketing respects unsubscribe. Necessary order updates bypass only
            // advertising opt-out, never complaints or unavailable-address blocks.
            skip_unsubscribe: message.transactional ? 1 : 0,
            ...(message.transactional ? { bypass_unsubscribed: 1 } : {}),
          },
        }),
      },
    );
    const result = await response.json();
    if (
      response.ok &&
      result.status === "success" &&
      typeof result.job_id === "string" &&
      result.job_id &&
      Array.isArray(result.emails) &&
      result.emails.some(
        (email: unknown) =>
          typeof email === "string" &&
          email.toLowerCase() === message.to.toLowerCase(),
      ) &&
      !Object.keys(result.failed_emails ?? {}).some(
        (email) => email.toLowerCase() === message.to.toLowerCase(),
      )
    )
      return { state: "accepted", jobId: result.job_id };

    // A gateway/server error can occur after acceptance. Do not blindly resend.
    if (response.status >= 500) return { state: "unknown" };
    if (
      result.status === "error" ||
      Object.keys(result.failed_emails ?? {}).length
    )
      return {
        state: "rejected",
        code: typeof result.code === "number" ? result.code : undefined,
        httpStatus: response.status,
      };
    return { state: "unknown" };
  } catch {
    // Never include raw provider errors: they can contain credentials or contacts.
    return { state: "unknown" };
  }
}
