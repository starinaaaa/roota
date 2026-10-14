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
  orderMessage = false,
) {
  const fill = (s: string) =>
    s.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => values[key] ?? "");
  const subject = fill(template.subject)
    .replace(/[\r\n]/g, " ")
    .slice(0, 200);
  const sourceBody = template.body.replace(/\\+n/g, "\n");
  const body = fill(
    orderMessage
      ? sourceBody
          .split("\n")
          .filter(
            (line) =>
              !/^(?:\{\{items\}\}|Итого:\s*\{\{total\}\}\s*₽\.?)$/.test(
                line.trim(),
              ),
          )
          .join("\n")
      : sourceBody,
  );
  const details = orderMessage
    ? [
        `Заказ № ${values.number} · ${values.date}`,
        "Состав заказа",
        values.items,
        `Доставка: ${values.shipping}`,
        `Итого: ${values.total} ₽`,
        values.payment,
        "Доставка",
        values.delivery,
        values.address,
        `Получатель: ${values.recipient}`,
        `Номер отправления: ${values.tracking}`,
      ].join("\n")
    : "";
  const text = (value: string | undefined) => escapeHtml(value ?? "");
  const itemRows = (values.items ?? "")
    .split("\n")
    .filter(Boolean)
    .map((item) => {
      const split = item.lastIndexOf(" — ");
      const name = split < 0 ? item : item.slice(0, split);
      const amount = split < 0 ? "" : item.slice(split + 3);
      return `<tr><td style="padding:14px 0;border-bottom:1px solid #e7e5e4">${text(name)}</td><td align="right" style="padding:14px 0 14px 16px;border-bottom:1px solid #e7e5e4;white-space:nowrap">${text(amount)}</td></tr>`;
    })
    .join("");
  const detailHtml = details
    ? `<div style="margin:28px 0;border-top:1px solid #e7e5e4;padding-top:24px">
    <p style="font-size:12px;letter-spacing:1px;color:#78716c;text-transform:uppercase;margin:0 0 8px">Ваш заказ № ${text(values.number)}</p>
    <p style="font-size:13px;color:#78716c;margin:0 0 16px">${text(values.date)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px">${itemRows}
      <tr><td style="padding:16px 0">Доставка</td><td align="right" style="white-space:nowrap;padding-left:16px">${text(values.shipping)}</td></tr>
      <tr><td style="padding:18px 0;border-top:1px solid #d6d3d1;font-size:21px">Итого</td><td align="right" style="border-top:1px solid #d6d3d1;font-size:21px;white-space:nowrap">${text(values.total)} ₽</td></tr>
    </table>
    <p style="font-size:13px;color:#57534e;margin:0 0 24px">${text(values.payment)}</p>
    <div style="background:#f8f6f1;padding:20px;font-size:14px;line-height:1.7">
      <p style="margin:0 0 8px;font-size:16px">${text(values.delivery)}</p>
      <p style="margin:0 0 12px">${text(values.address)}<br>Получатель: ${text(values.recipient)}</p>
      <p style="margin:0;color:#78716c">Номер отправления<br><span style="color:#292724">${text(values.tracking)}</span></p>
    </div>
  </div>`
    : "";
  const plaintext = `ROOTA\n\n${body}${details ? `\n\n${details}` : ""}\n\n${label}: ${url}\n\nНужна помощь? Ответьте на письмо: hello@roota.moscow${unsubscribe ? `\nНастройки и отписка: ${unsubscribe}` : ""}`;
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f8f6f1;color:#292724"><div style="max-width:600px;margin:32px auto;padding:28px 24px;background:#fff;font-family:Arial,sans-serif;line-height:1.6"><p style="letter-spacing:5px">ROOTA</p><h1 style="font-size:28px;line-height:1.25;font-weight:400;overflow-wrap:normal">${escapeHtml(subject)}</h1><p>${escapeHtml(body).replaceAll("\n", "<br>")}</p>${detailHtml}<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#292724;color:#fff;text-decoration:none">${escapeHtml(label)}</a></p><p style="font-size:13px">Нужна помощь? <a href="mailto:hello@roota.moscow" style="color:#292724">hello@roota.moscow</a><br>Ответьте на это письмо — мы рядом.</p>${unsubscribe ? `<p style="font-size:12px"><a href="${escapeHtml(unsubscribe)}">Настройки и отписка</a></p>` : ""}</div></body></html>`;
  return { subject, html, plaintext };
}
