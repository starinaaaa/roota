export const templateKinds = [
  "order_created",
  "order_paid",
  "order_shipped",
  "order_pickup",
  "order_delivered",
  "review_invite",
  "cart_reminder",
  "restock",
  "confirm",
  "cart_link",
] as const;
export type TemplateKind = (typeof templateKinds)[number];
export const marketingKinds = new Set<string>([
  "review_invite",
  "cart_reminder",
  "restock",
  "cart_link",
]);
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function renderEmail(
  template: { subject: string; body: string },
  values: Record<string, string>,
  url: string,
  label: string,
  unsubscribe?: string,
) {
  const fill = (s: string) =>
    s.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => values[key] ?? "");
  const subject = fill(template.subject)
    .replace(/[\r\n]/g, " ")
    .slice(0, 200);
  const body = fill(template.body.replaceAll("\\n", "\n"));
  const plaintext = `ROOTA\n\n${body}\n\n${label}: ${url}\n\nНужна помощь? Ответьте на письмо: hello@roota.moscow${unsubscribe ? `\nНастройки и отписка: ${unsubscribe}` : ""}`;
  const html = `<!doctype html><html lang="ru"><body style="margin:0;background:#f8f6f1;color:#292724"><div style="max-width:560px;margin:32px auto;padding:32px;background:#fff;font-family:Arial,sans-serif;line-height:1.6"><p style="letter-spacing:5px">ROOTA</p><h1 style="font-size:24px;font-weight:400">${escapeHtml(subject)}</h1><p>${escapeHtml(body).replaceAll("\n", "<br>")}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#292724;color:#fff;text-decoration:none">${escapeHtml(label)}</a></p><p style="font-size:13px">Нужна помощь? Ответьте на это письмо — мы рядом.</p>${unsubscribe ? `<p style="font-size:12px"><a href="${escapeHtml(unsubscribe)}">Настройки и отписка</a></p>` : ""}</div></body></html>`;
  return { subject, html, plaintext };
}
